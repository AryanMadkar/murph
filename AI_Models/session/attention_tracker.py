import cv2
import time
import numpy as np
from collections import deque
from face_landmarks import get_landmarks
from scoring import attention_score, get_nose_position, face_center_score
from utils import distance

# ============ CONFIGURATION ============
FRAME_SKIP = 2                    # Process every Nth frame (performance boost)
FACE_TOLERANCE_SECONDS = 2        # Seconds to tolerate missing face
SMOOTHING_WINDOW = 10             # Frames for moving average
STABILITY_HISTORY_SIZE = 15       # Frames to track for head stability

# Head stability thresholds
STABLE_MOVEMENT_THRESHOLD = 5     # Pixels - very stable
MAX_MOVEMENT_THRESHOLD = 25       # Pixels - too much movement

# ============ INITIALIZATION ============
cap = cv2.VideoCapture(0)
scores = []
score_buffer = deque(maxlen=SMOOTHING_WINDOW)  # Temporal smoothing

# Frame skipping
frame_counter = 0

# Face tolerance
last_face_detected_time = time.time()

# Head stability tracking
previous_nose_position = None
movement_history = deque(maxlen=STABILITY_HISTORY_SIZE)

# Session timing
session_start_time = time.time()

# Check if camera opened successfully
if not cap.isOpened():
    print("Error: Could not open camera")
    exit()

def get_head_stability_score():
    """Calculate head stability based on recent movement."""
    if len(movement_history) < 5:
        return 1.0  # Not enough data, assume stable
    
    avg_movement = sum(movement_history) / len(movement_history)
    
    if avg_movement < STABLE_MOVEMENT_THRESHOLD:
        return 1.0
    elif avg_movement > MAX_MOVEMENT_THRESHOLD:
        return 0.0
    else:
        return 1 - (avg_movement - STABLE_MOVEMENT_THRESHOLD) / (MAX_MOVEMENT_THRESHOLD - STABLE_MOVEMENT_THRESHOLD)

def get_attention_consistency(scores_list):
    """Calculate how consistent attention has been (lower variance = better)."""
    if len(scores_list) < 10:
        return 1.0
    
    variance = np.var(scores_list[-50:])  # Last 50 frames
    # Map variance to score: low variance = high consistency
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
    """Compare first half vs second half attention (positive = improving)."""
    if len(scores_list) < 20:
        return 0.0
    
    mid = len(scores_list) // 2
    first_half = scores_list[:mid]
    second_half = scores_list[mid:]
    
    first_avg = sum(first_half) / len(first_half)
    second_avg = sum(second_half) / len(second_half)
    
    return second_avg - first_avg

# ============ MAIN LOOP ============
while True:
    ret, frame = cap.read()
    
    if not ret or frame is None:
        print("Error: Could not read frame")
        continue

    frame_counter += 1

    # Frame skipping for performance
    if frame_counter % FRAME_SKIP != 0:
        cv2.imshow("Session Tracker", frame)
        if cv2.waitKey(1) == 27:
            break
        continue

    landmarks = get_landmarks(frame)
    score = 0
    stability_score = 1.0
    center_score = 1.0

    if landmarks:
        last_face_detected_time = time.time()
        
        # Get base attention score
        base_score = attention_score(landmarks, frame.shape)
        
        # Get face centering score
        center_score = face_center_score(landmarks, frame.shape)
        
        # Track head movement for stability
        nose_pos = get_nose_position(landmarks, frame.shape)
        if previous_nose_position is not None:
            movement = distance(nose_pos, previous_nose_position)
            movement_history.append(movement)
        previous_nose_position = nose_pos
        
        # Get head stability score
        stability_score = get_head_stability_score()
        
        # Combined attention score with new weights
        # base_score already includes gaze, head pose, eye openness
        # Now we add stability and centering
        score = (
            0.60 * base_score +
            0.25 * stability_score +
            0.15 * center_score
        )

    else:
        # Face tolerance - don't drop score immediately
        if time.time() - last_face_detected_time < FACE_TOLERANCE_SECONDS:
            score = scores[-1] if scores else 0.5
        else:
            score = 0
            previous_nose_position = None  # Reset tracking

    # Temporal smoothing (moving average)
    score_buffer.append(score)
    smooth_score = sum(score_buffer) / len(score_buffer)

    scores.append(smooth_score)

    # Determine display color based on score
    if smooth_score >= 0.7:
        color = (0, 255, 0)    # Green - good attention
    elif smooth_score >= 0.4:
        color = (0, 255, 255)  # Yellow - moderate
    else:
        color = (0, 0, 255)    # Red - low attention

    # Display attention score
    cv2.putText(
        frame,
        f"Attention: {smooth_score:.2f}",
        (20, 50),
        cv2.FONT_HERSHEY_SIMPLEX,
        1,
        color,
        2
    )

    # Display head stability
    stability_color = (0, 255, 0) if stability_score > 0.7 else (0, 255, 255) if stability_score > 0.4 else (0, 0, 255)
    cv2.putText(
        frame,
        f"Stability: {stability_score:.2f}",
        (20, 90),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.7,
        stability_color,
        2
    )

    # Display face centering
    cv2.putText(
        frame,
        f"Centering: {center_score:.2f}",
        (20, 120),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.6,
        (255, 200, 0),
        2
    )

    cv2.imshow("Session Tracker", frame)

    if cv2.waitKey(1) == 27:
        break

cap.release()
cv2.destroyAllWindows()

# ============ SESSION SUMMARY ============
session_duration = time.time() - session_start_time

if scores:
    avg_score = sum(scores) / len(scores)
    consistency = get_attention_consistency(scores)
    longest_distraction = get_longest_distraction(scores)
    momentum = get_session_momentum(scores)
    
    print("\n" + "="*55)
    print("                  SESSION SUMMARY")
    print("="*55)
    print(f"  Session duration:        {session_duration:.1f} seconds")
    print(f"  Total frames processed:  {len(scores)}")
    print("-"*55)
    print("  ATTENTION METRICS")
    print("-"*55)
    print(f"  Average attention:       {avg_score:.2f}")
    print(f"  Highest attention:       {max(scores):.2f}")
    print(f"  Lowest attention:        {min(scores):.2f}")
    print("-"*55)
    print("  ENGAGEMENT ANALYTICS")
    print("-"*55)
    print(f"  Consistency score:       {consistency:.2f}")
    print(f"  Longest distraction:     {longest_distraction} frames")
    
    # Momentum interpretation
    if momentum > 0.05:
        momentum_text = f"+{momentum:.2f} (Improving ↑)"
    elif momentum < -0.05:
        momentum_text = f"{momentum:.2f} (Declining ↓)"
    else:
        momentum_text = f"{momentum:.2f} (Steady →)"
    print(f"  Session momentum:        {momentum_text}")
    
    # Overall grade
    overall = (avg_score * 0.4 + consistency * 0.3 + (1 - longest_distraction/len(scores)) * 0.3)
    if overall >= 0.8:
        grade = "Excellent"
    elif overall >= 0.6:
        grade = "Good"
    elif overall >= 0.4:
        grade = "Fair"
    else:
        grade = "Needs Improvement"
    
    print("-"*55)
    print(f"  OVERALL ENGAGEMENT:      {grade} ({overall:.2f})")
    print("="*55)
else:
    print("\nNo attention scores recorded during this session.")
