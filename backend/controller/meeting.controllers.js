const Meeting = require("../models/meeting.models");
const User = require("../models/user.models");
const WalletTransaction = require("../models/walletTransaction.models");
const { v4: uuidv4 } = require("uuid");

// Session pricing (in cents)
const SESSION_PRICE_CENTS = 500; // $5.00 per session - adjust as needed

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

    // ⭐ STEP 6 - Check wallet balance before allowing request
    const student = await User.findById(studentId);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    if (student.walletBalance < SESSION_PRICE_CENTS) {
      return res.status(400).json({
        success: false,
        message: "Insufficient balance",
        required: SESSION_PRICE_CENTS / 100,
        current: student.walletBalance / 100,
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

    // Deduct from wallet
    student.walletBalance -= SESSION_PRICE_CENTS;
    await student.save();

    // Record transaction
    await WalletTransaction.create({
      userId: studentId,
      amount: SESSION_PRICE_CENTS,
      type: "DEBIT",
      status: "SUCCESS",
      category: "SESSION",
      description: "Session booking payment",
      balanceAfter: student.walletBalance,
    });

    const newMeeting = new Meeting({
      studentId,
      teacherId,
      status: "pending",
      sessionPrice: SESSION_PRICE_CENTS,
    });

    await newMeeting.save();

    res.status(201).json({
      success: true,
      message: "Meeting request sent",
      meeting: newMeeting,
      walletBalance: student.walletBalance / 100,
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

// Decline meeting and refund student
const declineMeeting = async (req, res) => {
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

    // Refund student
    const refundAmount = meeting.sessionPrice || SESSION_PRICE_CENTS;
    const student = await User.findById(meeting.studentId);
    
    if (student) {
      student.walletBalance += refundAmount;
      await student.save();

      await WalletTransaction.create({
        userId: meeting.studentId,
        amount: refundAmount,
        type: "CREDIT",
        status: "SUCCESS",
        category: "REFUND",
        description: "Session declined - refund",
        balanceAfter: student.walletBalance,
      });
    }

    meeting.status = "declined";
    await meeting.save();

    res.json({
      success: true,
      message: "Meeting declined and student refunded",
      refundAmount: refundAmount / 100,
    });
  } catch (error) {
    console.error("Decline meeting error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};

module.exports = {
  requestMeeting,
  getPendingMeetings,
  acceptMeeting,
  declineMeeting,
  getTeachers,
};
