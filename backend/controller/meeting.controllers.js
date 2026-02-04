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
      message: `Meeting request sent.`,
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

// Complete meeting (No payment transfer)
const completeMeeting = async (req, res) => {
  try {
    const { meetingId, roomId } = req.body;

    let meeting;
    if (meetingId) {
      meeting = await Meeting.findById(meetingId);
    } else if (roomId) {
      meeting = await Meeting.findOne({ roomId });
    }

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: "Meeting not found",
      });
    }

    if (meeting.status === "completed") {
      return res.status(400).json({
        success: false,
        message: "Meeting already completed",
      });
    }

    meeting.status = "completed";
    meeting.completedAt = new Date();
    await meeting.save();

    // Find the associated attention session to return its ID
    const AttentionSession = require("../models/Attentionsession.models");
    const {
      calculateMetrics,
      calculateTeacherEffectiveness,
    } = require("./Attention.controllers");
    const attentionSession = await AttentionSession.findOne({
      roomId,
      status: "active",
    });

    let attentionSessionId = null;
    if (attentionSession) {
      attentionSession.sessionEndTime = new Date();
      attentionSession.sessionDuration = Math.floor(
        (attentionSession.sessionEndTime - attentionSession.sessionStartTime) /
          1000,
      );

      // Populate metrics using the shared calculator
      const metrics = calculateMetrics(attentionSession.attentionScores);
      attentionSession.metrics = metrics;
      attentionSession.teacherEffectiveness =
        calculateTeacherEffectiveness(metrics);
      attentionSession.status = "completed";

      await attentionSession.save();
      attentionSessionId = attentionSession._id;
      console.log(
        `Attention session ${attentionSessionId} finalized with metrics.`,
      );
    }

    res.json({
      success: true,
      message: "Session completed.",
      meeting,
      attentionSessionId, // Return this for teacher redirection
    });
  } catch (error) {
    console.error("Complete meeting error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};

// Cancel meeting and refund student
const cancelMeeting = async (req, res) => {
  try {
    const { meetingId } = req.body;

    const meeting = await Meeting.findById(meetingId);

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: "Meeting not found",
      });
    }

    if (meeting.status === "completed") {
      return res.status(400).json({
        success: false,
        message: "Cannot cancel completed meeting",
      });
    }

    // Refund student if payment was held
    if (meeting.paymentStatus === "held") {
      const student = await User.findById(meeting.studentId);
      if (student) {
        student.walletBalance += meeting.amount;
        await student.save();
      }

      meeting.paymentStatus = "refunded";
      meeting.status = "cancelled";
      await meeting.save();

      res.json({
        success: true,
        message: `Meeting cancelled. ₹${meeting.amount} refunded to your wallet.`,
        meeting,
      });
    } else {
      meeting.status = "cancelled";
      await meeting.save();

      res.json({
        success: true,
        message: "Meeting cancelled",
        meeting,
      });
    }
  } catch (error) {
    console.error("Cancel meeting error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};

// Get user's wallet balance
const getWalletBalance = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.json({
      success: true,
      balance: user.walletBalance || 0,
    });
  } catch (error) {
    console.error("Get wallet balance error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};

// Add money to wallet (for testing/admin)
const addMoney = async (req, res) => {
  try {
    const { userId, amount } = req.body;

    if (!userId || !amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Valid user ID and positive amount required",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    user.walletBalance = (user.walletBalance || 0) + amount;
    await user.save();

    res.json({
      success: true,
      message: `₹${amount} added to wallet`,
      newBalance: user.walletBalance,
    });
  } catch (error) {
    console.error("Add money error:", error);
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
