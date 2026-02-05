const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth.middleware");
const {
  startSession,
  heartbeat,
  endSession,
  pauseSession,
  resumeSession,
  getSessionStatus
} = require("../controller/session.controllers");

// All routes require auth except heartbeat (called frequently)
router.post("/start/:meetingId", authMiddleware, startSession);
router.post("/heartbeat/:meetingId", heartbeat); // No auth - called every 30s
router.post("/end/:meetingId", authMiddleware, endSession);
router.post("/pause/:meetingId", authMiddleware, pauseSession);
router.post("/resume/:meetingId", authMiddleware, resumeSession);
router.get("/status/:meetingId", authMiddleware, getSessionStatus);

module.exports = router;
