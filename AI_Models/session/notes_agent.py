import os
import tempfile
import boto3
from groq import Groq
from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import StateGraph, END
from typing import TypedDict, Optional
from dotenv import load_dotenv

load_dotenv()

# Initialize Clients
groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))
llm = ChatGroq(
    groq_api_key=os.getenv("GROQ_API_KEY"),
    model_name="groq/compound"
)

s3 = boto3.client(
    "s3",
    region_name=os.getenv("AWS_REGION"),
    aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
    aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY")
)

BUCKET_NAME = os.getenv("AWS_S3_BUCKET_NAME")


class AgentState(TypedDict):
    audio_key: str
    room_id: str
    transcription: Optional[str]
    cleaned_text: Optional[str]
    summary: Optional[str]
    notes: Optional[str]
    error: Optional[str]

# --- Nodes ---


def transcription_node(state: AgentState):
    """Download from S3 and transcribe using Groq Whisper."""
    try:
        audio_key = state["audio_key"]

        # Download file to local temp
        with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as tmp:
            s3.download_fileobj(BUCKET_NAME, audio_key, tmp)
            temp_path = tmp.name

        # Transcribe
        with open(temp_path, "rb") as file:
            transcription = groq_client.audio.transcriptions.create(
                file=(temp_path, file.read()),
                model="whisper-large-v3",
                response_format="text",
                language="en"
            )

        os.unlink(temp_path)
        return {"transcription": transcription}
    except Exception as e:
        return {"error": f"Transcription error: {str(e)}"}


def correction_node(state: AgentState):
    """Clean up filler words and segment text."""
    if state.get("error"):
        return state

    prompt = f"Clean up the following transcript by removing filler words (ums, ahs) and fixing obvious grammatical errors from speech-to-text. Return only the cleaned text.\n\nTranscript: {state['transcription']}"

    response = llm.invoke([SystemMessage(
        content="You are a professional editor."), HumanMessage(content=prompt)])
    return {"cleaned_text": response.content}


def summary_node(state: AgentState):
    """Extract key concepts and action items."""
    if state.get("error"):
        return state

    prompt = f"Summarize the following lecture transcript. Extract key concepts, main arguments, and any action items discussed.\n\nText: {state['cleaned_text']}"

    response = llm.invoke([SystemMessage(
        content="You are an expert academic assistant."), HumanMessage(content=prompt)])
    return {"summary": response.content}


def formatting_node(state: AgentState):
    """Format into beautiful Markdown notes."""
    if state.get("error"):
        return state

    prompt = f"Format the following summary into beautiful Markdown notes for a student. Use headers, bullet points, and bold text to highlight important terms.\n\nSummary: {state['summary']}"

    response = llm.invoke([SystemMessage(
        content="You are a professional note-taker."), HumanMessage(content=prompt)])
    return {"notes": response.content}

# --- Graph ---


workflow = StateGraph(AgentState)

workflow.add_node("transcribe", transcription_node)
workflow.add_node("correct", correction_node)
workflow.add_node("summarize", summary_node)
workflow.add_node("format", formatting_node)

workflow.set_entry_point("transcribe")
workflow.add_edge("transcribe", "correct")
workflow.add_edge("correct", "summarize")
workflow.add_edge("summarize", "format")
workflow.add_edge("format", END)

notes_agent = workflow.compile()


async def generate_notes(audio_key: str, room_id: str):
    """entry point to run the agent."""
    initial_state = {
        "audio_key": audio_key,
        "room_id": room_id,
        "transcription": None,
        "cleaned_text": None,
        "summary": None,
        "notes": None,
        "error": None
    }

    result = await notes_agent.ainvoke(initial_state)
    return result
