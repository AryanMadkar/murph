const express = require("express");
const router = express.Router();
const {
  requestMeeting,
  getPendingMeetings,
  getStudentSessions,
  getStudentSessionHistory,
  acceptMeeting,
  startMeeting,
  completeMeeting,
  cancelMeeting,
  declineMeeting,
  getTeachers,
  getWalletBalance,
  addMoney,
  uploadSessionAudio,
  saveNotes,
  testCompleteTeacherSession,
} = require("../controller/meeting.controllers");

// Get all teachers (for student dashboard)
router.get("/teachers", getTeachers);

// Student requests a meeting (⭐ deducts from wallet)
router.post("/request", requestMeeting);

// Get student's sessions (pending, active, completed - for dashboard)
router.get("/student/:studentId", getStudentSessions);

// Get student's complete session history (for My Sessions page)
router.get("/student/:studentId/history", getStudentSessionHistory);

// Teacher gets pending requests
router.get("/pending/:teacherId", getPendingMeetings);

// Teacher accepts a meeting
router.post("/accept/:meetingId", acceptMeeting);

// Start meeting when video call begins
router.post("/start/:roomId", startMeeting);

// Complete meeting (release escrow)
router.post("/complete", completeMeeting);

// Teacher declines a meeting (⭐ refunds student)
router.post("/decline/:meetingId", declineMeeting);

// Cancel a meeting (⭐ refunds student from escrow)
router.post("/cancel", cancelMeeting);

const multer = require("multer");
const upload = multer();

// Audio recording upload (for AI notes)
router.post("/upload-audio", upload.single("audio"), uploadSessionAudio);

// Save results from AI service
router.post("/save-notes", saveNotes);

// ⭐ TEST: Complete latest session for a teacher (for testing payment)
router.post("/test-complete", testCompleteTeacherSession);

// Get session notes and transcription
router.get("/session-notes/:meetingId", getSessionNotes);

module.exports = router;
