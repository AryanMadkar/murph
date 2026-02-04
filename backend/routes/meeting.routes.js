const express = require("express");
const router = express.Router();
const {
  requestMeeting,
  getPendingMeetings,
  acceptMeeting,
  completeMeeting,
  cancelMeeting,
  getTeachers,
  getWalletBalance,
  addMoney,
} = require("../controller/meeting.controllers");

// Get all teachers (for student dashboard)
router.get("/teachers", getTeachers);

// Student requests a meeting
router.post("/request", requestMeeting);

// Teacher gets pending requests
router.get("/pending/:teacherId", getPendingMeetings);

// Teacher accepts a meeting
router.post("/accept/:meetingId", acceptMeeting);

// Complete meeting (transfer payment)
router.post("/complete", completeMeeting);

// Cancel meeting (refund payment)
router.post("/cancel", cancelMeeting);

// Wallet routes
router.get("/wallet/:userId", getWalletBalance);
router.post("/wallet/add", addMoney);

module.exports = router;
