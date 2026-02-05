"""
Virtual Teacher AI Orchestrator
Generates educational video lessons using:
- Groq LLM for script generation
- ElevenLabs for text-to-speech
- D-ID for avatar video generation
"""

import os
import asyncio
import aiohttp
import json
from typing import Optional
from dataclasses import dataclass
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn
from groq import Groq

# ========== Configuration ==========
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "")
DID_API_KEY = os.getenv("DID_API_KEY", "")

# Default settings
DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"  # ElevenLabs Rachel
DEFAULT_AVATAR_ID = "amy-jcwCkr1grs"  # D-ID Amy

app = FastAPI(title="Virtual Teacher AI Service")


# ========== Request/Response Models ==========
class GenerateLessonRequest(BaseModel):
    lessonId: str
    topic: str
    avatarId: Optional[str] = DEFAULT_AVATAR_ID
    voiceId: Optional[str] = DEFAULT_VOICE_ID
    language: Optional[str] = "en"


class GenerateLessonResponse(BaseModel):
    success: bool
    script: Optional[str] = None
    keyPoints: Optional[list] = None
    audioUrl: Optional[str] = None
    videoUrl: Optional[str] = None
    thumbnailUrl: Optional[str] = None
    duration: Optional[int] = None
    jobId: Optional[str] = None
    error: Optional[str] = None


# ========== LLM Script Generation ==========
async def generate_script(topic: str, language: str = "en") -> dict:
    """
    Generate an educational script using Groq LLM
    """
    if not GROQ_API_KEY:
        raise ValueError("GROQ_API_KEY not configured")

    client = Groq(api_key=GROQ_API_KEY)

    system_prompt = """You are an expert educational content creator and virtual teacher. 
Your goal is to create engaging, informative, and easy-to-understand educational scripts.
The script should:
- Be 2-3 minutes when spoken (approximately 300-400 words)
- Start with a hook to grab attention
- Explain concepts clearly with examples
- Use a conversational, friendly tone
- End with a summary of key takeaways

IMPORTANT: Output ONLY the script text that will be spoken. No stage directions or actions.
Format the response as JSON with these fields:
{
    "script": "The full script to be spoken...",
    "keyPoints": ["Key point 1", "Key point 2", "Key point 3"]
}"""

    user_prompt = f"Create an educational script about: {topic}"
    if language != "en":
        user_prompt += f"\n\nIMPORTANT: Generate the script in {language} language."

    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.7,
            max_tokens=2000,
            response_format={"type": "json_object"}
        )

        content = response.choices[0].message.content
        result = json.loads(content)

        return {
            "script": result.get("script", ""),
            "keyPoints": result.get("keyPoints", [])
        }
    except Exception as e:
        print(f"Script generation error: {e}")
        raise


# ========== ElevenLabs TTS ==========
async def generate_audio(script: str, voice_id: str = DEFAULT_VOICE_ID) -> str:
    """
    Convert script to speech using ElevenLabs API
    Returns the audio URL
    """
    if not ELEVENLABS_API_KEY:
        raise ValueError("ELEVENLABS_API_KEY not configured")

    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"

    headers = {
        "Accept": "audio/mpeg",
        "Content-Type": "application/json",
        "xi-api-key": ELEVENLABS_API_KEY
    }

    payload = {
        "text": script,
        "model_id": "eleven_multilingual_v2",
        "voice_settings": {
            "stability": 0.5,
            "similarity_boost": 0.75,
            "style": 0.5,
            "use_speaker_boost": True
        }
    }

    async with aiohttp.ClientSession() as session:
        async with session.post(url, headers=headers, json=payload) as response:
            if response.status != 200:
                error_text = await response.text()
                raise Exception(f"ElevenLabs API error: {error_text}")

            # Save audio to temporary file and upload to storage
            audio_data = await response.read()

            # For now, we'll save locally - in production, upload to S3
            audio_path = f"/tmp/audio_{os.urandom(8).hex()}.mp3"
            with open(audio_path, "wb") as f:
                f.write(audio_data)

            # TODO: Upload to S3 and return URL
            # For now, return local path (replace with S3 URL in production)
            return audio_path


# ========== D-ID Video Generation ==========
async def generate_video(audio_url: str, script: str, avatar_id: str = DEFAULT_AVATAR_ID) -> dict:
    """
    Generate avatar video using D-ID API
    Returns video URL and job ID
    """
    if not DID_API_KEY:
        raise ValueError("DID_API_KEY not configured")

    url = "https://api.d-id.com/talks"

    headers = {
        "Authorization": f"Basic {DID_API_KEY}",
        "Content-Type": "application/json"
    }

    # Use text-to-video with D-ID's built-in TTS as fallback
    # Or use the audio URL from ElevenLabs
    payload = {
        # Default presenter
        "source_url": f"https://d-id-public-bucket.s3.us-west-2.amazonaws.com/alice.jpg",
        "script": {
            "type": "text",
            "input": script,
            "provider": {
                "type": "microsoft",
                "voice_id": "en-US-JennyNeural"
            }
        },
        "config": {
            "fluent": True,
            "pad_audio": 0.5
        }
    }

    # If we have ElevenLabs audio, use audio-based generation
    if audio_url and os.path.exists(audio_url):
        # For audio-based generation, we need to upload audio first
        # This is a simplified version - production would use S3 URLs
        payload["script"] = {
            "type": "text",
            "input": script[:500],  # Fallback to text if audio fails
            "provider": {
                "type": "microsoft",
                "voice_id": "en-US-JennyNeural"
            }
        }

    async with aiohttp.ClientSession() as session:
        async with session.post(url, headers=headers, json=payload) as response:
            if response.status not in [200, 201]:
                error_text = await response.text()
                raise Exception(f"D-ID API error: {error_text}")

            result = await response.json()
            job_id = result.get("id")

            # Poll for completion
            video_url = await poll_did_job(job_id, headers)

            return {
                "jobId": job_id,
                "videoUrl": video_url
            }


async def poll_did_job(job_id: str, headers: dict, max_attempts: int = 60) -> str:
    """
    Poll D-ID API for job completion
    """
    url = f"https://api.d-id.com/talks/{job_id}"

    async with aiohttp.ClientSession() as session:
        for attempt in range(max_attempts):
            async with session.get(url, headers=headers) as response:
                if response.status != 200:
                    await asyncio.sleep(3)
                    continue

                result = await response.json()
                status = result.get("status")

                if status == "done":
                    return result.get("result_url", "")
                elif status == "error":
                    raise Exception(
                        f"D-ID job failed: {result.get('error', 'Unknown error')}")

                # Still processing
                await asyncio.sleep(3)

        raise Exception("D-ID job timed out")


# ========== Main Generation Endpoint ==========
@app.post("/api/virtual-teacher/generate", response_model=GenerateLessonResponse)
async def generate_lesson(request: GenerateLessonRequest):
    """
    Generate a complete virtual teacher lesson
    """
    try:
        # Step 1: Generate script with LLM
        print(f"[{request.lessonId}] Generating script for: {request.topic}")
        script_result = await generate_script(request.topic, request.language)
        script = script_result["script"]
        key_points = script_result["keyPoints"]

        if not script:
            raise Exception("Failed to generate script")

        print(f"[{request.lessonId}] Script generated: {len(script)} chars")

        # Step 2: Generate audio with ElevenLabs
        print(f"[{request.lessonId}] Generating audio...")
        audio_url = ""
        try:
            audio_url = await generate_audio(script, request.voiceId)
            print(f"[{request.lessonId}] Audio generated: {audio_url}")
        except Exception as e:
            print(f"[{request.lessonId}] Audio generation failed: {e}")
            # Continue with D-ID's built-in TTS

        # Step 3: Generate video with D-ID
        print(f"[{request.lessonId}] Generating video...")
        video_result = await generate_video(audio_url, script, request.avatarId)

        print(f"[{request.lessonId}] Video generated: {video_result['videoUrl']}")

        # Calculate approximate duration (150 words per minute)
        word_count = len(script.split())
        duration_seconds = int((word_count / 150) * 60)

        return GenerateLessonResponse(
            success=True,
            script=script,
            keyPoints=key_points,
            audioUrl=audio_url,
            videoUrl=video_result["videoUrl"],
            jobId=video_result["jobId"],
            duration=duration_seconds
        )

    except Exception as e:
        print(f"[{request.lessonId}] Generation failed: {e}")
        return GenerateLessonResponse(
            success=False,
            error=str(e)
        )


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "virtual-teacher-ai"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)
