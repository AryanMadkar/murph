const express = require("express");
const router = express.Router();
const {
  requestMeeting,
  getPendingMeetings,
  acceptMeeting,
  declineMeeting,
  getTeachers,
  getWalletBalance,
  addMoney,
} = require("../controller/meeting.controllers");

// Get all teachers (for student dashboard)
router.get("/teachers", getTeachers);

// Student requests a meeting (⭐ deducts from wallet)
router.post("/request", requestMeeting);

// Teacher gets pending requests
router.get("/pending/:teacherId", getPendingMeetings);

// Teacher accepts a meeting
router.post("/accept/:meetingId", acceptMeeting);

// Teacher declines a meeting (⭐ refunds student)
router.post("/decline/:meetingId", declineMeeting);

module.exports = router;
