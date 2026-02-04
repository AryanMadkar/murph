from utils import distance
from config import *

LEFT_EYE = [33, 160, 158, 133, 153, 144]

def get_point(landmarks, idx, w, h):
    return (
        int(landmarks[idx].x * w),
        int(landmarks[idx].y * h)
    )

def eye_aspect_ratio(landmarks, w, h):
    p = lambda i: get_point(landmarks, i, w, h)

    p1 = p(LEFT_EYE[0])
    p2 = p(LEFT_EYE[1])
    p3 = p(LEFT_EYE[2])
    p4 = p(LEFT_EYE[3])
    p5 = p(LEFT_EYE[4])
    p6 = p(LEFT_EYE[5])

    vertical = distance(p2, p6) + distance(p3, p5)
    horizontal = distance(p1, p4)

    # Prevent division by zero
    if horizontal == 0 or horizontal < 0.001:
        return 0.2  # Default EAR value when detection fails
    
    return vertical / (2 * horizontal)

def eye_score(ear):
    if ear > EAR_OPEN_THRESHOLD:
        return 1
    elif ear < EAR_CLOSE_THRESHOLD:
        return 0
    else:
        return (ear - EAR_CLOSE_THRESHOLD) / (
            EAR_OPEN_THRESHOLD - EAR_CLOSE_THRESHOLD
        )

def head_pose_score(landmarks, w, h):
    nose = get_point(landmarks, 1, w, h)
    left_eye = get_point(landmarks, 33, w, h)
    right_eye = get_point(landmarks, 263, w, h)

    eye_center_x = (left_eye[0] + right_eye[0]) / 2
    offset = abs(nose[0] - eye_center_x)

    if offset < HEAD_CENTER_THRESHOLD:
        return 1
    elif offset > HEAD_MAX_THRESHOLD:
        return 0
    else:
        return 1 - (
            offset - HEAD_CENTER_THRESHOLD
        ) / (
            HEAD_MAX_THRESHOLD - HEAD_CENTER_THRESHOLD
        )

def attention_score(landmarks, frame_shape):
    h, w, _ = frame_shape

    ear = eye_aspect_ratio(landmarks, w, h)
    e_score = eye_score(ear)
    h_score = head_pose_score(landmarks, w, h)

    gaze = 0.6 * h_score + 0.4 * e_score
    f_score = 1

    return (
        GAZE_WEIGHT * gaze +
        HEAD_WEIGHT * h_score +
        EYE_WEIGHT * e_score +
        FACE_WEIGHT * f_score
    )

def get_ear_value(landmarks, frame_shape):
    """Get Eye Aspect Ratio for blink detection."""
    h, w, _ = frame_shape
    return eye_aspect_ratio(landmarks, w, h)

def get_nose_position(landmarks, frame_shape):
    """Get nose position for head stability tracking."""
    h, w, _ = frame_shape
    return get_point(landmarks, 1, w, h)

def face_center_score(landmarks, frame_shape):
    """
    Measure how centered the face is in the frame.
    Face drifting to edges indicates distraction/multitasking.
    """
    h, w, _ = frame_shape
    nose = get_point(landmarks, 1, w, h)
    
    center_x = w / 2
    center_y = h / 2
    
    # Horizontal offset (most important)
    offset_x = abs(nose[0] - center_x)
    max_offset_x = w / 3
    
    # Vertical offset (less strict)
    offset_y = abs(nose[1] - center_y)
    max_offset_y = h / 2.5
    
    x_score = max(0, 1 - offset_x / max_offset_x)
    y_score = max(0, 1 - offset_y / max_offset_y)
    
    # Weight horizontal more than vertical
    return 0.7 * x_score + 0.3 * y_score
