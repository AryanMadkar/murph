const express = require("express");
const router = express.Router();
const {
  requestMeeting,
  getPendingMeetings,
  acceptMeeting,
  getTeachers,
} = require("../controller/meeting.controllers");

// Get all teachers (for student dashboard)
router.get("/teachers", getTeachers);

// Student requests a meeting
router.post("/request", requestMeeting);

// Teacher gets pending requests
router.get("/pending/:teacherId", getPendingMeetings);

// Teacher accepts a meeting
router.post("/accept/:meetingId", acceptMeeting);

module.exports = router;
