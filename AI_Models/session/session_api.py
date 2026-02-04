"""
Session Attention Service - FastAPI Backend
Provides REST API endpoints for attention tracking.
"""

from fastapi import FastAPI, UploadFile, File, BackgroundTasks, Body
from fastapi.middleware.cors import CORSMiddleware
from uuid import uuid4
import time
import cv2
import numpy as np
import httpx
import os

from face_landmarks import get_landmarks
from scoring import attention_score, face_center_score, get_nose_position
from utils import distance
from notes_agent import generate_notes


# ============ FASTAPI APP ============
app = FastAPI(
    title="Session Attention Service",
    description="API for real-time attention tracking and engagement analytics",
    version="1.0.0"
)

# Enable CORS for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============ SESSION STORAGE ============
sessions = {}

# ============ CONFIGURATION ============
STABLE_MOVEMENT_THRESHOLD = 5
MAX_MOVEMENT_THRESHOLD = 25

# ============ HELPER FUNCTIONS ============


def get_head_stability_score(movement_history):
    """Calculate head stability based on recent movement."""
    if len(movement_history) < 5:
        return 1.0

    avg_movement = sum(movement_history[-15:]) / len(movement_history[-15:])

    if avg_movement < STABLE_MOVEMENT_THRESHOLD:
        return 1.0
    elif avg_movement > MAX_MOVEMENT_THRESHOLD:
        return 0.0
    else:
        return 1 - (avg_movement - STABLE_MOVEMENT_THRESHOLD) / (MAX_MOVEMENT_THRESHOLD - STABLE_MOVEMENT_THRESHOLD)


def get_attention_consistency(scores_list):
    """Calculate how consistent attention has been."""
    if len(scores_list) < 10:
        return 1.0

    variance = np.var(scores_list[-50:])
    return 1 / (1 + variance * 5)


def get_longest_distraction(scores_list, threshold=0.4):
    """Find longest continuous period below attention threshold."""
    longest = 0
    current = 0

    for s in scores_list:
        if s < threshold:
            current += 1
            longest = max(longest, current)
        else:
            current = 0

    return longest


def get_session_momentum(scores_list):
    """Compare first half vs second half attention."""
    if len(scores_list) < 20:
        return 0.0

    mid = len(scores_list) // 2
    first_half = scores_list[:mid]
    second_half = scores_list[mid:]

    first_avg = sum(first_half) / len(first_half)
    second_avg = sum(second_half) / len(second_half)

    return second_avg - first_avg

# ============ API ENDPOINTS ============


@app.get("/")
def root():
    """Health check endpoint."""
    return {
        "status": "running",
        "service": "Session Attention Service",
        "version": "1.0.0"
    }


@app.post("/session/start")
def start_session():
    """Start a new attention tracking session."""
    session_id = str(uuid4())

    sessions[session_id] = {
        "start_time": time.time(),
        "scores": [],
        "movement_history": [],
        "previous_nose_position": None,
        "frame_count": 0
    }

    return {
        "session_id": session_id,
        "message": "Session started successfully"
    }


@app.post("/session/frame/{session_id}")
async def process_frame(session_id: str, file: UploadFile = File(...)):
    """Process a single frame and return attention score."""
    if session_id not in sessions:
        return {"error": "Invalid session ID"}

    session = sessions[session_id]
    session["frame_count"] += 1

    # Decode image from uploaded file
    contents = await file.read()
    npimg = np.frombuffer(contents, np.uint8)
    frame = cv2.imdecode(npimg, cv2.IMREAD_COLOR)

    if frame is None:
        return {"error": "Could not decode image"}

    landmarks = get_landmarks(frame)

    if landmarks:
        # Get base attention score
        base_score = attention_score(landmarks, frame.shape)

        # Get face centering score
        center_score = face_center_score(landmarks, frame.shape)

        # Track head movement for stability
        nose_pos = get_nose_position(landmarks, frame.shape)
        if session["previous_nose_position"] is not None:
            movement = distance(nose_pos, session["previous_nose_position"])
            session["movement_history"].append(movement)
        session["previous_nose_position"] = nose_pos

        # Get head stability score
        stability_score = get_head_stability_score(session["movement_history"])

        # Combined attention score
        final_score = (
            0.60 * base_score +
            0.25 * stability_score +
            0.15 * center_score
        )

        session["scores"].append(final_score)

        return {
            "attention_score": round(final_score, 3),
            "stability_score": round(stability_score, 3),
            "centering_score": round(center_score, 3),
            "face_detected": True,
            "frame_number": session["frame_count"]
        }

    else:
        # No face detected - use last score if available
        if session["scores"]:
            last_score = session["scores"][-1]
        else:
            last_score = 0.0

        session["scores"].append(last_score * 0.9)  # Slight decay

        return {
            "attention_score": round(last_score * 0.9, 3),
            "face_detected": False,
            "frame_number": session["frame_count"]
        }


@app.post("/session/end/{session_id}")
def end_session(session_id: str):
    """End session and return summary statistics."""
    if session_id not in sessions:
        return {"error": "Invalid session ID"}

    session = sessions[session_id]
    scores = session["scores"]
    duration = time.time() - session["start_time"]

    if not scores:
        return {
            "session_id": session_id,
            "message": "No frames processed",
            "duration": round(duration, 1)
        }

    avg_score = sum(scores) / len(scores)

    return {
        "session_id": session_id,
        "duration_seconds": round(duration, 1),
        "frames_processed": len(scores),
        "average_attention": round(avg_score, 3),
        "max_attention": round(max(scores), 3),
        "min_attention": round(min(scores), 3),
        "status": "completed"
    }


@app.get("/session/report/{session_id}")
def session_report(session_id: str):
    """Get detailed engagement analytics report."""
    if session_id not in sessions:
        return {"error": "Invalid session ID"}

    session = sessions[session_id]
    scores = session["scores"]
    duration = time.time() - session["start_time"]

    if not scores:
        return {"message": "No scores available"}

    avg_score = sum(scores) / len(scores)
    consistency = get_attention_consistency(scores)
    longest_distraction = get_longest_distraction(scores)
    momentum = get_session_momentum(scores)

    # Overall engagement grade
    overall = (avg_score * 0.4 + consistency * 0.3 +
               (1 - longest_distraction/max(len(scores), 1)) * 0.3)

    if overall >= 0.8:
        grade = "Excellent"
    elif overall >= 0.6:
        grade = "Good"
    elif overall >= 0.4:
        grade = "Fair"
    else:
        grade = "Needs Improvement"

    # Momentum interpretation
    if momentum > 0.05:
        momentum_trend = "Improving"
    elif momentum < -0.05:
        momentum_trend = "Declining"
    else:
        momentum_trend = "Steady"

    return {
        "session_id": session_id,
        "duration_seconds": round(duration, 1),
        "frames_processed": len(scores),
        "attention_metrics": {
            "average": round(avg_score, 3),
            "highest": round(max(scores), 3),
            "lowest": round(min(scores), 3)
        },
        "engagement_analytics": {
            "consistency_score": round(consistency, 3),
            "longest_distraction_frames": longest_distraction,
            "session_momentum": round(momentum, 3),
            "momentum_trend": momentum_trend
        },
        "overall_engagement": {
            "score": round(overall, 3),
            "grade": grade
        }
    }


@app.get("/session/live/{session_id}")
def live_status(session_id: str):
    """Get current live attention status."""
    if session_id not in sessions:
        return {"error": "Invalid session ID"}

    session = sessions[session_id]
    scores = session["scores"]

    if not scores:
        return {"current_attention": 0, "trend": "unknown"}

    current = scores[-1]

    # Recent trend (last 10 frames)
    if len(scores) >= 10:
        recent_avg = sum(scores[-10:]) / 10
        older_avg = sum(scores[-20:-10]) / \
            10 if len(scores) >= 20 else recent_avg

        if recent_avg > older_avg + 0.05:
            trend = "improving"
        elif recent_avg < older_avg - 0.05:
            trend = "declining"
        else:
            trend = "stable"
    else:
        trend = "stabilizing"

    return {
        "current_attention": round(current, 3),
        "recent_average": round(sum(scores[-10:]) / len(scores[-10:]), 3) if scores else 0,
        "trend": trend,
        "frames_processed": len(scores)
    }


@app.delete("/session/{session_id}")
def delete_session(session_id: str):
    """Delete a session from memory."""
    if session_id not in sessions:
        return {"error": "Invalid session ID"}

    del sessions[session_id]
    return {"message": "Session deleted", "session_id": session_id}


async def update_backend_notes(room_id, transcription, notes):
    """Notify Node.js backend with the generated notes."""
    try:
        backend_url = os.getenv(
            "VITE_API_URL", "http://localhost:5000")  # Adjust as needed
        async with httpx.AsyncClient() as client:
            await client.post(f"{backend_url}/api/meetings/save-notes", json={
                "roomId": room_id,
                "transcription": transcription,
                "notes": notes
            })
            print(f"✅ Notes sent to backend for room {room_id}")
    except Exception as e:
        print(f"❌ Failed to send notes to backend: {str(e)}")


@app.post("/session/notes/{room_id}")
async def start_notes_generation(room_id: str, background_tasks: BackgroundTasks, data: dict = Body(...)):
    """Trigger the LangGraph agent to process audio and generate notes."""
    audio_key = data.get("audio_key")
    if not audio_key:
        return {"error": "audio_key is required"}

    async def run_agent_and_update():
        result = await generate_notes(audio_key, room_id)
        if not result.get("error"):
            await update_backend_notes(room_id, result["transcription"], result["notes"])
        else:
            print(f"❌ Agent Error: {result['error']}")

    background_tasks.add_task(run_agent_and_update)

    return {
        "success": True,
        "message": "AI Notes generation started in background",
        "room_id": room_id
    }


@app.get("/sessions")
def list_sessions():
    """List all active sessions."""
    return {
        "active_sessions": len(sessions),
        "session_ids": list(sessions.keys())
    }
