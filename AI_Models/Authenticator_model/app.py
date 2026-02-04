import uvicorn
from typing import List, Dict, Any
import logging
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from deepface import DeepFace
import numpy as np
import tempfile
import os

# Suppress TensorFlow oneDNN warning
os.environ["TF_ENABLE_ONEDNN_OPTS"] = "0"


# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


# Initialize FastAPI app
app = FastAPI(
    title="Face Authentication AI Service",
    description="DeepFace-based face encoding and matching API",
    version="1.0.0"
)
# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify exact origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration
# Options: VGG-Face, Facenet, OpenFace, DeepFace, DeepID, ArcFace, Dlib
FACE_MODEL = os.getenv("FACE_MODEL", "Facenet")
MATCH_THRESHOLD = float(os.getenv("MATCH_THRESHOLD", "0.9"))
ENFORCE_DETECTION = os.getenv("ENFORCE_DETECTION", "False").lower() == "true"
# 'skip' avoids detection logic and uses the whole image - very reliable for webcams
DETECTOR_BACKEND = os.getenv("DETECTOR_BACKEND", "skip")


# Pydantic models
class MatchRequest(BaseModel):
    """Request model for face matching"""
    new_embedding: List[float]
    stored_embeddings: List[List[float]]


class EncodingResponse(BaseModel):
    """Response model for face encoding"""
    success: bool
    embedding: List[float] = None
    error: str = None


class MatchResponse(BaseModel):
    """Response model for face matching"""
    match: bool
    distance: float = None

# ================== HELPER FUNCTIONS ==================


def save_temp_image(upload_file: UploadFile) -> str:
    """
    Save uploaded image to a temporary file

    Args:
        upload_file: FastAPI UploadFile object

    Returns:
        str: Path to temporary file
    """
    try:
        # Extract file extension
        filename = upload_file.filename or "image.jpg"
        suffix = filename.split(".")[-1] if "." in filename else "jpg"

        # Create temporary file
        with tempfile.NamedTemporaryFile(delete=False, suffix=f".{suffix}") as temp:
            content = upload_file.file.read()
            temp.write(content)
            temp_path = temp.name

        logger.info(f"Saved temporary image: {temp_path}")
        return temp_path

    except Exception as e:
        logger.error(f"Error saving temporary image: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error saving image: {str(e)}")


def cleanup_temp_file(file_path: str) -> None:
    """
    Remove temporary file

    Args:
        file_path: Path to file to remove
    """
    try:
        if os.path.exists(file_path):
            os.remove(file_path)
            logger.info(f"Cleaned up temporary file: {file_path}")
    except Exception as e:
        logger.warning(
            f"Error cleaning up temporary file {file_path}: {str(e)}")


# ================== API ENDPOINTS ==================

@app.get("/")
async def root():
    """Root endpoint - API information"""
    return {
        "service": "Face Authentication AI Service",
        "version": "1.0.0",
        "status": "running",
        "endpoints": {
            "encode": "/encode",
            "match": "/match",
            "health": "/health"
        }
    }


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "model": FACE_MODEL,
        "threshold": MATCH_THRESHOLD
    }


@app.post("/encode", response_model=EncodingResponse)
async def encode_face(file: UploadFile = File(...)):
    """
    Encode a face from an uploaded image

    Args:
        file: Uploaded image file containing a face

    Returns:
        EncodingResponse: Success status and face embedding or error message
    """
    temp_path = None

    try:
        # Validate file
        if not file:
            raise HTTPException(status_code=400, detail="No file provided")

        # Save uploaded file temporarily
        temp_path = save_temp_image(file)

        logger.info(f"Processing face encoding for file: {file.filename}")

        # Generate face embedding using DeepFace
        result = DeepFace.represent(
            img_path=temp_path,
            model_name=FACE_MODEL,
            enforce_detection=ENFORCE_DETECTION,
            detector_backend=DETECTOR_BACKEND
        )

        # Extract embedding from result
        if result and len(result) > 0:
            embedding = result[0]["embedding"]
            logger.info(
                f"Successfully encoded face. Embedding dimension: {len(embedding)}")

            return EncodingResponse(
                success=True,
                embedding=embedding
            )
        else:
            logger.warning("No face detected in the image")
            return EncodingResponse(
                success=False,
                error="No face detected in the image"
            )

    except ValueError as e:
        # DeepFace raises ValueError when no face is detected
        logger.warning(f"Face detection failed: {str(e)}")
        return EncodingResponse(
            success=False,
            error="No face detected in the image"
        )

    except Exception as e:
        logger.error(f"Error during face encoding: {str(e)}", exc_info=True)
        return EncodingResponse(
            success=False,
            error=f"Error processing image: {str(e)}"
        )

    finally:
        # Clean up temporary file
        if temp_path:
            cleanup_temp_file(temp_path)


@app.post("/match", response_model=MatchResponse)
async def match_faces(data: MatchRequest):
    """
    Match a new face embedding against stored embeddings

    Args:
        data: MatchRequest containing new embedding and stored embeddings

    Returns:
        MatchResponse: Match result and distance
    """
    try:
        # Validate input
        if not data.new_embedding:
            raise HTTPException(
                status_code=400, detail="new_embedding is required")

        if not data.stored_embeddings or len(data.stored_embeddings) == 0:
            raise HTTPException(
                status_code=400, detail="stored_embeddings is required")

        # Convert to numpy arrays
        new_embedding = np.array(data.new_embedding)

        logger.info(
            f"Matching against {len(data.stored_embeddings)} stored embeddings")

        # Find minimum distance among all stored embeddings
        min_distance = float('inf')

        for idx, stored_emb in enumerate(data.stored_embeddings):
            stored_array = np.array(stored_emb)

            # Calculate Euclidean distance
            distance = np.linalg.norm(new_embedding - stored_array)

            logger.debug(f"Distance to embedding {idx}: {distance}")

            if distance < min_distance:
                min_distance = distance

        # Check if minimum distance is below threshold
        is_match = min_distance < MATCH_THRESHOLD

        logger.info(
            f"Match result: {is_match}, Distance: {min_distance:.4f}, Threshold: {MATCH_THRESHOLD}")

        return MatchResponse(
            match=is_match,
            distance=float(min_distance)
        )

    except Exception as e:
        logger.error(f"Error during face matching: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Error matching faces: {str(e)}"
        )


# ================== RUN SERVER ==================

if __name__ == "__main__":
    logger.info(f"Starting Face Authentication AI Service on port 8000")
    logger.info(f"Using model: {FACE_MODEL}")
    logger.info(f"Match threshold: {MATCH_THRESHOLD}")

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8090,
        log_level="info"
    )
