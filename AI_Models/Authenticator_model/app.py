import uvicorn
from typing import List, Dict, Any, Optional
import logging
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import numpy as np
import cv2
import tempfile
import os
from functools import lru_cache
import face_recognition  
from io import BytesIO

# Suppress warnings
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
    description="Optimized face encoding and matching API",
    version="2.0.1"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration
FACE_MODEL = os.getenv("FACE_MODEL", "Facenet")  # Kept for compatibility
# Optimized threshold
MATCH_THRESHOLD = float(os.getenv("MATCH_THRESHOLD", "0.6"))
ENFORCE_DETECTION = os.getenv("ENFORCE_DETECTION", "True").lower() == "true"
# hog is faster, cnn is more accurate
DETECTOR_BACKEND = os.getenv("DETECTOR_BACKEND", "hog")
DISTANCE_METRIC = os.getenv(
    "DISTANCE_METRIC", "euclidean")  # euclidean or cosine

# Image preprocessing settings
MAX_IMAGE_SIZE = 1024  # Resize large images for faster processing
# More jitters = more accurate but slower
NUM_JITTERS = int(os.getenv("NUM_JITTERS", "1"))


# Pydantic models
class MatchRequest(BaseModel):
    """Request model for face matching"""
    new_embedding: List[float]
    stored_embeddings: List[List[float]]


class EncodingResponse(BaseModel):
    """Response model for face encoding"""
    success: bool
    embedding: Optional[List[float]] = None
    error: Optional[str] = None


class MatchResponse(BaseModel):
    """Response model for face matching"""
    match: bool
    distance: Optional[float] = None


# ================== HELPER FUNCTIONS ==================

def preprocess_image(image_bytes: bytes) -> np.ndarray:
    """
    Preprocess image for face detection with OpenCV for better compatibility

    Args:
        image_bytes: Raw image bytes

    Returns:
        np.ndarray: Preprocessed image in RGB format (uint8)
    """
    try:
        # Convert bytes to numpy array
        nparr = np.frombuffer(image_bytes, np.uint8)
        
        # Decode image with OpenCV (most compatible with face_recognition)
        image_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if image_bgr is None:
            # If OpenCV fails, try PIL as fallback
            logger.warning("OpenCV failed to decode image, trying PIL fallback")
            from PIL import Image
            
            try:
                pil_image = Image.open(BytesIO(image_bytes))
                logger.info(f"PIL loaded image - Mode: {pil_image.mode}, Size: {pil_image.size}")
                
                # Convert to RGB if needed
                if pil_image.mode != "RGB":
                    pil_image = pil_image.convert("RGB")
                    logger.info("Converted image to RGB mode")
                
                # Convert to numpy array
                image_rgb = np.array(pil_image)
                
                # Ensure uint8 type
                if image_rgb.dtype != np.uint8:
                    image_rgb = image_rgb.astype(np.uint8)
                    logger.info(f"Converted array to uint8 from {image_rgb.dtype}")
                
                return np.ascontiguousarray(image_rgb, dtype=np.uint8)
                
            except Exception as pil_error:
                raise ValueError(f"Both OpenCV and PIL failed to decode image. PIL error: {str(pil_error)}")
        
        # OpenCV succeeded - convert BGR to RGB
        logger.info(f"OpenCV decoded image - Shape: {image_bgr.shape}, Dtype: {image_bgr.dtype}")
        image_rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
        
        # Resize if too large
        height, width = image_rgb.shape[:2]
        if max(width, height) > MAX_IMAGE_SIZE:
            ratio = MAX_IMAGE_SIZE / max(width, height)
            new_width = int(width * ratio)
            new_height = int(height * ratio)
            image_rgb = cv2.resize(image_rgb, (new_width, new_height), interpolation=cv2.INTER_AREA)
            logger.info(f"Resized image from {width}x{height} to {new_width}x{new_height}")
        
        # Ensure contiguous array in memory
        return np.ascontiguousarray(image_rgb, dtype=np.uint8)
        
    except Exception as e:
        logger.error(f"Error preprocessing image: {str(e)}")
        raise


def encode_face_optimized(image_rgb: np.ndarray) -> Optional[List[float]]:
    """
    Generate face embedding using optimized face_recognition library

    Args:
        image_rgb: Image in RGB format

    Returns:
        List[float]: Face embedding or None if no face detected
    """
    try:
        # Validate image format for face_recognition
        if len(image_rgb.shape) != 3 or image_rgb.shape[2] != 3:
            raise ValueError(f"Invalid image shape: {image_rgb.shape}. Expected 3-channel RGB image.")
        
        if image_rgb.dtype != np.uint8:
            logger.warning(f"Converting image from {image_rgb.dtype} to uint8")
            image_rgb = image_rgb.astype(np.uint8)
        
        logger.info(f"Encoding face - Shape: {image_rgb.shape}, Dtype: {image_rgb.dtype}, Min: {image_rgb.min()}, Max: {image_rgb.max()}")
        
        # Detect face locations
        face_locations = face_recognition.face_locations(
            image_rgb,
            model=DETECTOR_BACKEND
        )

        if not face_locations:
            logger.warning("No face detected in image")
            return None

        # Use the first detected face
        if len(face_locations) > 1:
            logger.info(
                f"Multiple faces detected ({len(face_locations)}), using the first one")

        # Generate face encodings
        face_encodings = face_recognition.face_encodings(
            image_rgb,
            known_face_locations=face_locations,
            num_jitters=NUM_JITTERS
        )

        if not face_encodings:
            logger.warning("Failed to generate face encoding")
            return None

        # Return first encoding as list
        embedding = face_encodings[0].tolist()
        logger.info(
            f"Successfully generated face encoding (dim: {len(embedding)})")

        return embedding

    except Exception as e:
        logger.error(f"Error encoding face: {str(e)}")
        raise


def calculate_distance(embedding1: np.ndarray, embedding2: np.ndarray, metric: str = "euclidean") -> float:
    """
    Calculate distance between two embeddings

    Args:
        embedding1: First embedding
        embedding2: Second embedding
        metric: Distance metric ('euclidean' or 'cosine')

    Returns:
        float: Distance value
    """
    if metric == "cosine":
        # Cosine distance: 1 - cosine_similarity
        dot_product = np.dot(embedding1, embedding2)
        norm1 = np.linalg.norm(embedding1)
        norm2 = np.linalg.norm(embedding2)

        if norm1 > 0 and norm2 > 0:
            cosine_similarity = dot_product / (norm1 * norm2)
            return 1 - cosine_similarity
        else:
            return 2.0  # Maximum distance
    else:
        # Euclidean distance (default for face_recognition)
        return np.linalg.norm(embedding1 - embedding2)


# ================== API ENDPOINTS ==================

@app.get("/")
async def root():
    """Root endpoint - API information"""
    return {
        "service": "Face Authentication AI Service",
        "version": "2.0.1",
        "status": "running",
        "optimization": "face_recognition library with preprocessing",
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
        "model": "face_recognition (dlib)",
        "threshold": MATCH_THRESHOLD,
        "detector": DETECTOR_BACKEND,
        "distance_metric": DISTANCE_METRIC,
        "enforce_detection": ENFORCE_DETECTION,
        "max_image_size": MAX_IMAGE_SIZE,
        "num_jitters": NUM_JITTERS
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
    try:
        # Validate file
        if not file:
            raise HTTPException(status_code=400, detail="No file provided")

        logger.info(f"Processing face encoding for file: {file.filename}")

        # Read file content
        content = await file.read()
        
        # Validate content
        if not content or len(content) == 0:
            return EncodingResponse(
                success=False,
                error="Empty file provided"
            )

        # Preprocess image
        image_rgb = preprocess_image(content)

        # Generate embedding
        embedding = encode_face_optimized(image_rgb)

        if embedding is None:
            return EncodingResponse(
                success=False,
                error="No face detected in the image"
            )

        return EncodingResponse(
            success=True,
            embedding=embedding
        )

    except ValueError as e:
        logger.warning(f"Face detection failed: {str(e)}")
        return EncodingResponse(
            success=False,
            error=f"Error processing image: {str(e)}"
        )

    except Exception as e:
        logger.error(f"Error during face encoding: {str(e)}", exc_info=True)
        return EncodingResponse(
            success=False,
            error=f"Error processing image: {str(e)}"
        )


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
        stored_embeddings = np.array(data.stored_embeddings)

        logger.info(
            f"Matching against {len(data.stored_embeddings)} stored embeddings")

        # Vectorized distance calculation (much faster than loop)
        if DISTANCE_METRIC == "cosine":
            # Vectorized cosine distance
            dot_products = np.dot(stored_embeddings, new_embedding)
            norms_stored = np.linalg.norm(stored_embeddings, axis=1)
            norm_new = np.linalg.norm(new_embedding)

            if norm_new > 0 and np.all(norms_stored > 0):
                cosine_similarities = dot_products / (norms_stored * norm_new)
                distances = 1 - cosine_similarities
            else:
                distances = np.full(len(stored_embeddings), 2.0)
        else:
            # Vectorized Euclidean distance
            distances = np.linalg.norm(
                stored_embeddings - new_embedding, axis=1)

        # Find minimum distance
        min_distance = float(np.min(distances))
        min_idx = int(np.argmin(distances))

        # Check if minimum distance is below threshold
        is_match = min_distance < MATCH_THRESHOLD

        logger.info(
            f"Match result: {is_match}, Min distance: {min_distance:.4f} "
            f"(embedding {min_idx}), Threshold: {MATCH_THRESHOLD}"
        )

        return MatchResponse(
            match=is_match,
            distance=min_distance
        )

    except Exception as e:
        logger.error(f"Error during face matching: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Error matching faces: {str(e)}"
        )


# ================== DEBUG ENDPOINT ==================

@app.post("/debug-image")
async def debug_image(file: UploadFile = File(...)):
    """
    Debug endpoint to check image format and preprocessing
    """
    try:
        content = await file.read()
        
        # Try OpenCV decoding
        nparr = np.frombuffer(content, np.uint8)
        img_cv = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        # Try PIL decoding
        from PIL import Image
        pil_img = Image.open(BytesIO(content))
        
        # Try preprocessing
        preprocessed = None
        try:
            preprocessed = preprocess_image(content)
        except Exception as preprocess_error:
            preprocessed = f"Preprocessing failed: {str(preprocess_error)}"
        
        return {
            "filename": file.filename,
            "content_size": len(content),
            "opencv_decoded": img_cv is not None,
            "opencv_shape": img_cv.shape if img_cv is not None else None,
            "opencv_dtype": str(img_cv.dtype) if img_cv is not None else None,
            "pil_mode": pil_img.mode,
            "pil_size": pil_img.size,
            "pil_format": pil_img.format,
            "preprocessed_info": str(preprocessed.shape) if isinstance(preprocessed, np.ndarray) else preprocessed
        }
    except Exception as e:
        return {"error": str(e)}


# ================== RUN SERVER ==================

if __name__ == "__main__":
    logger.info(
        f"Starting Optimized Face Authentication AI Service on port 8090")
    logger.info(f"Using optimized face_recognition library (dlib-based)")
    logger.info(f"Match threshold: {MATCH_THRESHOLD}")
    logger.info(f"Detector backend: {DETECTOR_BACKEND}")
    logger.info(f"Distance metric: {DISTANCE_METRIC}")

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8090,
        log_level="info"
    )