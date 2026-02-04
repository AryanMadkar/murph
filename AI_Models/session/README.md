# Session Attention Tracker

This module tracks student attentiveness using face landmarks.

## Features

It calculates attention score using:
- **Eye openness** - Monitors if eyes are open/closed using Eye Aspect Ratio (EAR)
- **Head pose** - Tracks if the student is facing the screen
- **Face presence** - Detects if a face is visible in frame

## Dependencies

- mediapipe
- opencv-python
- numpy

## Installation

```bash
pip install -r requirements.txt
```

## Usage

Run the attention tracker:

```bash
python attention_tracker.py
```

Press `ESC` to exit the application.

## Configuration

Adjust thresholds in `config.py`:
- `EAR_OPEN_THRESHOLD` / `EAR_CLOSE_THRESHOLD` - Eye openness thresholds
- `HEAD_CENTER_THRESHOLD` / `HEAD_MAX_THRESHOLD` - Head pose thresholds
- Weights for gaze, head, eye, and face scoring
