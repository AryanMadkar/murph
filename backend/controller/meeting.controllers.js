const Meeting = require("../models/meeting.models");
const { v4: uuidv4 } = require("uuid");

// Student requests a meeting with a teacher
const requestMeeting = async (req, res) => {
  try {
    const { studentId, teacherId } = req.body;

    if (!studentId || !teacherId) {
      return res.status(400).json({
        success: false,
        message: "Student ID and Teacher ID are required",
      });
    }

    // Check for existing pending request
    const existingRequest = await Meeting.findOne({
      studentId,
      teacherId,
      status: "pending",
    });

    if (existingRequest) {
      return res.status(400).json({
        success: false,
        message: "You already have a pending request with this teacher",
      });
    }

    const newMeeting = new Meeting({
      studentId,
      teacherId,
      status: "pending",
    });

    await newMeeting.save();

    res.status(201).json({
      success: true,
      message: "Meeting request sent",
      meeting: newMeeting,
    });
  } catch (error) {
    console.error("Request meeting error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};

// Teacher gets their pending meeting requests
const getPendingMeetings = async (req, res) => {
  try {
    const { teacherId } = req.params;

    const meetings = await Meeting.find({
      teacherId,
      status: "pending",
    }).populate("studentId", "email");

    res.json({
      success: true,
      meetings,
    });
  } catch (error) {
    console.error("Get pending meetings error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};

// Teacher accepts a meeting request
const acceptMeeting = async (req, res) => {
  try {
    const { meetingId } = req.params;

    const meeting = await Meeting.findById(meetingId);

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: "Meeting not found",
      });
    }

    if (meeting.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "This meeting is no longer pending",
      });
    }

    // Generate a unique room ID for the video call
    meeting.status = "accepted";
    meeting.roomId = uuidv4();
    await meeting.save();

    res.json({
      success: true,
      message: "Meeting accepted",
      roomId: meeting.roomId,
      meeting,
    });
  } catch (error) {
    console.error("Accept meeting error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};

// Get all teachers
const getTeachers = async (req, res) => {
  try {
    const User = require("../models/user.models");
    const teachers = await User.find({ role: "teacher" }, "email _id");

    res.json({
      success: true,
      teachers,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  requestMeeting,
  getPendingMeetings,
  acceptMeeting,
  getTeachers,
};
