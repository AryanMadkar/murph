const Meeting = require("../models/meeting.models");
const User = require("../models/user.models");
const WalletTransaction = require("../models/walletTransaction.models");
const { emitWalletUpdate } = require("../socket/socket");
const AttentionSession = require("../models/Attentionsession.models");
const Session = require("../models/session.models");
const { v4: uuidv4 } = require("uuid");
const axios = require("axios");
const { uploadToS3 } = require("../utils/s3");

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

    // ⭐ ESCROW: Deduct from wallet and hold in escrow
    student.walletBalance -= SESSION_PRICE_CENTS;
    await student.save();

    // Calculate fees
    const platformFee = Math.round(SESSION_PRICE_CENTS * 0.1); // 10% platform fee
    const teacherEarning = SESSION_PRICE_CENTS - platformFee; // 90% to teacher

    const newMeeting = new Meeting({
      studentId,
      teacherId,
      status: "pending",
      sessionPrice: SESSION_PRICE_CENTS,
      platformFee: platformFee,
      teacherEarning: teacherEarning,
      paymentStatus: "escrow", // ⭐ Funds held in escrow
    });

    await newMeeting.save();

    // Record escrow lock transaction
    await WalletTransaction.create({
      userId: studentId,
      amount: SESSION_PRICE_CENTS,
      type: "DEBIT",
      status: "SUCCESS",
      category: "ESCROW_LOCK",
      description: `Session payment held in escrow (Meeting #${newMeeting._id})`,
      balanceAfter: student.walletBalance,
      sessionId: newMeeting._id,
    });

    res.status(201).json({
      success: true,
      message: `Meeting request sent. $${(SESSION_PRICE_CENTS / 100).toFixed(2)} held in escrow.`,
      meeting: newMeeting,
      walletBalance: student.walletBalance / 100,
      escrowDetails: {
        amount: SESSION_PRICE_CENTS / 100,
        platformFee: platformFee / 100,
        teacherWillReceive: teacherEarning / 100,
      },
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

// Get student's session requests and active meetings
const getStudentSessions = async (req, res) => {
  try {
    const { studentId } = req.params;

    // Get pending requests (waiting for teacher to accept)
    const pendingRequests = await Meeting.find({
      studentId,
      status: "pending",
    }).populate("teacherId", "email name");

    // Get accepted/active sessions (ready for video call)
    const activeSessions = await Meeting.find({
      studentId,
      status: "accepted",
    }).populate("teacherId", "email name");

    // Get recent completed sessions (last 5)
    const completedSessions = await Meeting.find({
      studentId,
      status: "completed",
    })
      .populate("teacherId", "email name")
      .sort({ endedAt: -1 })
      .limit(5);

    res.json({
      success: true,
      pendingRequests,
      activeSessions,
      completedSessions,
    });
  } catch (error) {
    console.error("Get student sessions error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};

// Get student's complete session history (for My Sessions page)
const getStudentSessionHistory = async (req, res) => {
  try {
    const { studentId } = req.params;

    // 1. Get lifecycle meetings (Pending, Active, Cancelled)
    const meetings = await Meeting.find({
      studentId,
      status: { $ne: "completed" }, // Exclude completed from here (we'll look in Sessions)
    })
      .populate("teacherId", "email name")
      .sort({ createdAt: -1 });

    // 2. Get detailed completed sessions
    const sessions = await Session.find({ studentId })
      .populate("teacherId", "email name")
      .sort({ start_time: -1 });

    // 3. Normalize Session data to match UI expectations
    const formattedSessions = sessions.map((s) => ({
      _id: s._id,
      meetingId: s.meetingId,
      teacherId: s.teacherId,
      status: s.status.toLowerCase(), // "COMPLETED" -> "completed"
      createdAt: s.createdAt,
      startedAt: s.start_time,
      endedAt: s.end_time,
      durationMinutes: s.duration_minutes || s.calculated_duration,
      sessionPrice: s.final_cost ? s.final_cost * 100 : 0,
      roomId: s.roomId,
      transcription: s.transcription,
      notes: s.notes,
      isDetailed: true,
    }));

    // 4. Combine: Pending/Active (Meetings) + Completed (Sessions)
    // If a session exists for a meeting, use the session details
    const allItems = [...meetings, ...formattedSessions].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
    );

    res.json({
      success: true,
      sessions: allItems,
      total: allItems.length,
    });
  } catch (error) {
    console.error("Get student session history error:", error);
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

// Start meeting when video call begins
const startMeeting = async (req, res) => {
  try {
    const { roomId } = req.params;

    const meeting = await Meeting.findOne({ roomId });

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: "Meeting not found",
      });
    }

    if (meeting.status === "completed" || meeting.status === "cancelled") {
      return res.status(400).json({
        success: false,
        message: `Meeting is already ${meeting.status}`,
      });
    }

    // Set start time and change status to active
    if (!meeting.startedAt) {
      meeting.startedAt = new Date();
    }
    meeting.status = "active";
    await meeting.save();

    // ⭐ Initialize Attention Session automatically
    let attentionSession = await AttentionSession.findOne({
      roomId,
      status: "active",
    });

    if (!attentionSession) {
      attentionSession = new AttentionSession({
        meetingId: meeting._id,
        studentId: meeting.studentId,
        teacherId: meeting.teacherId,
        roomId: meeting.roomId,
        sessionStartTime: new Date(),
        attentionScores: [],
      });
      await attentionSession.save();
      console.log(
        `Created new attention session ${attentionSession._id} for room ${roomId}`,
      );
    }

    res.json({
      success: true,
      message: "Meeting started and attention tracking initialized",
      meeting,
      attentionSessionId: attentionSession._id,
    });
  } catch (error) {
    console.error("Start meeting error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};

// Complete meeting and release escrow to teacher
const completeMeeting = async (req, res) => {
  try {
    const { meetingId, roomId } = req.body;

    let meeting;
    if (meetingId) {
      meeting = await Meeting.findById(meetingId)
        .populate("studentId", "name email")
        .populate("teacherId", "name email");
    } else if (roomId) {
      meeting = await Meeting.findOne({ roomId })
        .populate("studentId", "name email")
        .populate("teacherId", "name email");
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

    // ⭐ ESCROW RELEASE: Transfer funds to teacher
    let bill = null;
    if (meeting.paymentStatus === "escrow") {
      const teacher = await User.findById(
        meeting.teacherId._id || meeting.teacherId,
      );

      if (teacher) {
        // Credit teacher's wallet (minus platform fee)
        teacher.walletBalance =
          (teacher.walletBalance || 0) + meeting.teacherEarning;
        await teacher.save();

        // Record teacher earning transaction
        await WalletTransaction.create({
          userId: teacher._id,
          amount: meeting.teacherEarning,
          type: "CREDIT",
          status: "SUCCESS",
          category: "SESSION_EARNING",
          description: `Session earning from ${meeting.studentId.name || meeting.studentId.email}`,
          balanceAfter: teacher.walletBalance,
          sessionId: meeting._id,
        });

        // Record platform fee transaction (for audit trail)
        await WalletTransaction.create({
          userId: teacher._id,
          amount: meeting.platformFee,
          type: "DEBIT",
          status: "SUCCESS",
          category: "PLATFORM_FEE",
          description: `Platform fee (10%) for session #${meeting._id}`,
          balanceAfter: teacher.walletBalance,
          sessionId: meeting._id,
        });

        // Update escrow release transaction for student
        await WalletTransaction.create({
          userId: meeting.studentId._id || meeting.studentId,
          amount: meeting.sessionPrice,
          type: "DEBIT",
          status: "SUCCESS",
          category: "ESCROW_RELEASE",
          description: `Escrow released to teacher for session #${meeting._id}`,
          sessionId: meeting._id,
        });

        meeting.paymentStatus = "released";

        // ⭐ Real-time notification to teacher
        emitWalletUpdate(teacher._id.toString(), {
          type: "CREDIT",
          amount: meeting.teacherEarning / 100,
          newBalance: teacher.walletBalance / 100,
          description: `Session payment received from ${meeting.studentId.name || meeting.studentId.email}`,
          timestamp: new Date(),
        });

        console.log(
          `✅ Teacher ${teacher.email} received $${(meeting.teacherEarning / 100).toFixed(2)} for session`,
        );

        // Generate detailed bill
        bill = {
          invoiceId: `INV-${meeting._id.toString().slice(-8).toUpperCase()}`,
          date: new Date().toISOString(),
          student: {
            name: meeting.studentId.name || meeting.studentId.email,
            email: meeting.studentId.email,
          },
          teacher: {
            name: meeting.teacherId.name || meeting.teacherId.email,
            email: meeting.teacherId.email,
          },
          session: {
            id: meeting._id,
            roomId: meeting.roomId,
            startedAt: meeting.startedAt,
            endedAt: new Date(),
            durationMinutes:
              meeting.durationMinutes ||
              Math.round(
                (new Date() -
                  new Date(meeting.startedAt || meeting.createdAt)) /
                  60000,
              ),
          },
          payment: {
            sessionPrice: (meeting.sessionPrice / 100).toFixed(2),
            platformFee: (meeting.platformFee / 100).toFixed(2),
            platformFeePercent: "10%",
            teacherEarning: (meeting.teacherEarning / 100).toFixed(2),
            currency: "USD",
          },
          status: "PAID",
        };
      }
    }

    meeting.status = "completed";
    meeting.endedAt = new Date();
    if (meeting.startedAt) {
      meeting.durationMinutes = Math.round(
        (meeting.endedAt - meeting.startedAt) / 60000,
      );
    }
    await meeting.save();

    // Find the associated attention session to return its ID
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
      message: bill
        ? "Session completed. Payment released to teacher."
        : "Session completed.",
      meeting,
      attentionSessionId, // Return this for teacher redirection
      bill, // Detailed payment bill
    });
  } catch (error) {
    console.error("Complete meeting error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};

// Cancel meeting and refund student from escrow
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

    // ⭐ Refund student if payment was in escrow
    if (meeting.paymentStatus === "escrow") {
      const student = await User.findById(meeting.studentId);
      if (student) {
        // Return full amount from escrow
        student.walletBalance += meeting.sessionPrice;
        await student.save();

        // Record refund transaction
        await WalletTransaction.create({
          userId: student._id,
          amount: meeting.sessionPrice,
          type: "CREDIT",
          status: "SUCCESS",
          category: "REFUND",
          description: `Escrow refund for cancelled session #${meeting._id}`,
          balanceAfter: student.walletBalance,
          sessionId: meeting._id,
        });
      }

      meeting.paymentStatus = "refunded";
      meeting.status = "cancelled";
      await meeting.save();

      res.json({
        success: true,
        message: `Meeting cancelled. $${(meeting.sessionPrice / 100).toFixed(2)} refunded to your wallet.`,
        meeting,
        refundedAmount: meeting.sessionPrice / 100,
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

// ⭐ TEST ENDPOINT: Complete latest accepted meeting for a teacher (for testing payment)
const testCompleteTeacherSession = async (req, res) => {
  try {
    const { teacherId } = req.body;

    if (!teacherId) {
      return res.status(400).json({
        success: false,
        message: "Teacher ID required",
      });
    }

    // Find the latest accepted meeting for this teacher
    const meeting = await Meeting.findOne({
      teacherId,
      status: "accepted",
      paymentStatus: "escrow",
    })
      .populate("studentId", "name email")
      .populate("teacherId", "name email")
      .sort({ createdAt: -1 });

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: "No active sessions found for this teacher",
      });
    }

    console.log(
      `🧪 TEST: Completing session ${meeting._id} for teacher ${meeting.teacherId.email}`,
    );

    // ⭐ ESCROW RELEASE: Transfer funds to teacher
    let bill = null;
    if (meeting.paymentStatus === "escrow") {
      const teacher = await User.findById(
        meeting.teacherId._id || meeting.teacherId,
      );

      if (teacher) {
        console.log(
          `💰 Teacher balance before: $${(teacher.walletBalance / 100).toFixed(2)}`,
        );

        // Credit teacher's wallet (minus platform fee)
        teacher.walletBalance =
          (teacher.walletBalance || 0) + meeting.teacherEarning;
        await teacher.save();

        console.log(
          `💰 Teacher balance after: $${(teacher.walletBalance / 100).toFixed(2)}`,
        );

        // Record teacher earning transaction
        await WalletTransaction.create({
          userId: teacher._id,
          amount: meeting.teacherEarning,
          type: "CREDIT",
          status: "SUCCESS",
          category: "SESSION_EARNING",
          description: `TEST: Session earning from ${meeting.studentId.name || meeting.studentId.email}`,
          balanceAfter: teacher.walletBalance,
          sessionId: meeting._id,
        });

        // Record platform fee transaction (for audit trail)
        await WalletTransaction.create({
          userId: teacher._id,
          amount: meeting.platformFee,
          type: "DEBIT",
          status: "SUCCESS",
          category: "PLATFORM_FEE",
          description: `Platform fee (10%) for session #${meeting._id}`,
          balanceAfter: teacher.walletBalance,
          sessionId: meeting._id,
        });

        meeting.paymentStatus = "released";

        // ⭐ Real-time notification to teacher
        emitWalletUpdate(teacher._id.toString(), {
          type: "CREDIT",
          amount: meeting.teacherEarning / 100,
          newBalance: teacher.walletBalance / 100,
          description: `Session payment received from ${meeting.studentId.name || meeting.studentId.email}`,
          timestamp: new Date(),
        });

        console.log(
          `✅ Teacher ${teacher.email} received $${(meeting.teacherEarning / 100).toFixed(2)} for session`,
        );
      }
    }

    meeting.status = "completed";
    meeting.endedAt = new Date();
    await meeting.save();

    res.json({
      success: true,
      message: `TEST: Session completed. Teacher received $${(meeting.teacherEarning / 100).toFixed(2)}`,
      meeting,
      teacherEarning: meeting.teacherEarning / 100,
      teacherNewBalance: (teacher?.walletBalance || 0) / 100,
    });
  } catch (error) {
    console.error("Test complete meeting error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};

// Handle audio recording upload from student session
const uploadSessionAudio = async (req, res) => {
  try {
    const { roomId } = req.body;
    const audioFile = req.file;

    if (!audioFile || !roomId) {
      return res.status(400).json({
        success: false,
        message: "Audio file and room ID are required",
      });
    }

    const meeting = await Meeting.findOne({ roomId });
    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: "Meeting not found for this room",
      });
    }

    // 1. Upload to S3
    const s3Key = await uploadToS3(
      audioFile.buffer,
      `session_${roomId}_${Date.now()}.webm`,
      "audio/webm",
      "recordings",
    );

    // 2. Update Session record (or create one if it doesn't exist)
    let session = await Session.findOne({ roomId });
    if (!session) {
      session = new Session({
        meetingId: meeting._id,
        studentId: meeting.studentId,
        teacherId: meeting.teacherId,
        roomId: meeting.roomId,
        status: "COMPLETED",
      });
    }

    session.audio_url = s3Key;
    await session.save();

    // 3. Trigger AI Processing (Asynchronous)
    const AI_SERVICE_URL =
      process.env.AI_SERVICE_URL || "http://127.0.0.1:8000";
    axios
      .post(`${AI_SERVICE_URL}/session/notes/${roomId}`, {
        audio_key: s3Key,
        student_id: meeting.studentId,
        teacher_id: meeting.teacherId,
      })
      .catch((err) => console.error("AI Service trigger error:", err.message));

    res.json({
      success: true,
      message: "Audio uploaded. AI is processing notes...",
      audio_url: s3Key,
    });
  } catch (error) {
    console.error("Upload audio error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};

// Save processed notes from AI service
const saveNotes = async (req, res) => {
  try {
    const { roomId, transcription, notes } = req.body;

    if (!roomId) {
      return res.status(400).json({
        success: false,
        message: "Room ID is required",
      });
    }

    // Update Session record
    const session = await Session.findOne({ roomId });
    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Session not found",
      });
    }

    session.transcription = transcription;
    session.notes = notes;
    await session.save();

    res.json({
      success: true,
      message: "Notes saved successfully",
    });
  } catch (error) {
    console.error("Save notes error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};

module.exports = {
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
};
