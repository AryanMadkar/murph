import cv2
import numpy as np

# Use OpenCV's Haar Cascade for face detection (simpler approach)
face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
eye_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_eye.xml')

class SimpleLandmark:
    def __init__(self, x, y):
        self.x = x
        self.y = y

def get_landmarks(frame):
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    # More lenient face detection parameters
    faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=3, minSize=(30, 30))
    
    if len(faces) > 0:
        # Get the largest face
        face = max(faces, key=lambda f: f[2] * f[3])
        x, y, w, h = face
        
        # Extract face region
        face_roi = gray[y:y+h, x:x+w]
        
        # Detect eyes in face region with more lenient parameters
        eyes = eye_cascade.detectMultiScale(face_roi, scaleFactor=1.05, minNeighbors=2, minSize=(15, 15))
        
        # Create simplified landmark structure
        frame_h, frame_w = frame.shape[:2]
        
        # Estimate eye positions based on face geometry (fallback)
        # Typical face proportions: eyes are about 1/3 from top
        le_x = x + int(w * 0.3)  # Left eye at 30% from left
        le_y = y + int(h * 0.35)  # Eyes at 35% from top
        re_x = x + int(w * 0.7)  # Right eye at 70% from left
        re_y = y + int(h * 0.35)
        
        # If we detected eyes, use their positions instead
        if len(eyes) >= 2:
            eyes = sorted(eyes, key=lambda e: e[0])
            left_eye = eyes[0]
            le_x = x + left_eye[0] + left_eye[2] // 2
            le_y = y + left_eye[1] + left_eye[3] // 2
            right_eye = eyes[1]
            re_x = x + right_eye[0] + right_eye[2] // 2
            re_y = y + right_eye[1] + right_eye[3] // 2
        elif len(eyes) == 1:
            # Only one eye detected - estimate the other
            eye = eyes[0]
            eye_x = x + eye[0] + eye[2] // 2
            eye_y = y + eye[1] + eye[3] // 2
            eye_width = int(w * 0.4)  # Distance between eyes
            if eye_x < x + w // 2:  # Left eye detected
                le_x, le_y = eye_x, eye_y
                re_x, re_y = eye_x + eye_width, eye_y
            else:  # Right eye detected
                re_x, re_y = eye_x, eye_y
                le_x, le_y = eye_x - eye_width, eye_y
        
        # Nose (estimated at center, 60% down)
        nose_x = x + w // 2
        nose_y = y + int(h * 0.6)
        
        # Eye dimensions for EAR calculation
        eye_h = int(h * 0.08)  # Approximate eye height
        eye_w = int(w * 0.15)  # Approximate eye width
        
        # Build landmark array matching expected indices
        # Index mapping for scoring.py:
        # 1: nose, 33: left eye center, 160/158/133/153/144: left eye points, 263: right eye
        landmarks = [None] * 468
        
        # Nose tip (index 1)
        landmarks[1] = SimpleLandmark(nose_x / frame_w, nose_y / frame_h)
        
        # Left eye landmarks
        landmarks[33] = SimpleLandmark(le_x / frame_w, le_y / frame_h)  # Left eye center
        landmarks[160] = SimpleLandmark((le_x) / frame_w, (le_y - eye_h) / frame_h)  # Top
        landmarks[158] = SimpleLandmark((le_x + eye_w//2) / frame_w, (le_y - eye_h//2) / frame_h)  # Top right
        landmarks[133] = SimpleLandmark((le_x + eye_w) / frame_w, le_y / frame_h)  # Right corner
        landmarks[153] = SimpleLandmark(le_x / frame_w, (le_y + eye_h) / frame_h)  # Bottom
        landmarks[144] = SimpleLandmark((le_x - eye_w) / frame_w, le_y / frame_h)  # Left corner
        
        # Right eye (index 263)
        landmarks[263] = SimpleLandmark(re_x / frame_w, re_y / frame_h)
        
        # Fill remaining with face center as fallback
        face_center = SimpleLandmark((x + w//2) / frame_w, (y + h//2) / frame_h)
        for i in range(468):
            if landmarks[i] is None:
                landmarks[i] = face_center
        
        return landmarks
    
    return None
