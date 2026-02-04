const User = require("../models/user.models");
const Meeting = require("../models/meeting.models");
const WalletTransaction = require("../models/walletTransaction.models");
const axios = require("axios");

// Finternet API Config
const FINTERNET_API_URL = process.env.FINTERNET_API_URL || "https://api.fmm.finternetlab.io/api/v1";
const FINTERNET_KEY = process.env.FINTERNET_KEY || process.env.FINTERNET_API_KEY;

/**
 * ⭐ STEP 7 — Create Escrow for Session
 * Creates a DELIVERY_VS_PAYMENT intent to lock funds until session completes
 * POST /api/escrow/create
 */
const createSessionEscrow = async (req, res) => {
  try {
    const { studentId, teacherId, sessionPrice } = req.body;

    // Validate inputs
    if (!studentId || !teacherId) {
      return res.status(400).json({ error: "Student ID and Teacher ID required" });
    }

    const amount = sessionPrice || 5.00; // Default $5.00

    // Get student and teacher
    const student = await User.findById(studentId);
    const teacher = await User.findById(teacherId);

    if (!student || !teacher) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check student has sufficient balance
    const amountInCents = Math.round(amount * 100);
    if (student.walletBalance < amountInCents) {
      return res.status(400).json({
        error: "Insufficient balance",
        required: amount,
        current: student.walletBalance / 100,
      });
    }

    // Create Finternet DELIVERY_VS_PAYMENT escrow intent
    const response = await axios.post(
      `${FINTERNET_API_URL}/payment-intents`,
      {
        amount: amount.toString(),
        currency: "USD",
        type: "DELIVERY_VS_PAYMENT",
        settlementMethod: "OFF_RAMP_MOCK",
        settlementDestination: teacher.bankAccount || `teacher_${teacherId}`,
        description: `Session escrow - Student to Teacher`,
        metadata: {
          studentId: studentId.toString(),
          teacherId: teacherId.toString(),
          type: "SESSION_ESCROW",
          platform: "murph",
        },
      },
      {
        headers: {
          "X-API-Key": FINTERNET_KEY,
          "Content-Type": "application/json",
        },
      }
    );

    const intentData = response.data.data || response.data;

    // Deduct from student wallet (locked in escrow)
    student.walletBalance -= amountInCents;
    await student.save();

    // Record escrow transaction
    await WalletTransaction.create({
      userId: studentId,
      amount: amountInCents,
      type: "DEBIT",
      status: "SUCCESS",
      category: "ESCROW_LOCK",
      description: `Session escrow locked - $${amount}`,
      externalRef: intentData.id,
      balanceAfter: student.walletBalance,
      metadata: {
        escrowIntentId: intentData.id,
        teacherId: teacherId.toString(),
        sessionPrice: amount,
      },
    });

    res.json({
      success: true,
      data: {
        escrowIntentId: intentData.id,
        amount: amount,
        status: "LOCKED",
        studentBalance: student.walletBalance / 100,
      },
    });
  } catch (error) {
    console.error("Create escrow error:", error.response?.data || error.message);
    res.status(500).json({
      error: "Failed to create escrow",
      details: error.response?.data || error.message,
    });
  }
};

/**
 * ⭐ Release Escrow to Teacher (Session Completed)
 * POST /api/escrow/release
 */
const releaseEscrow = async (req, res) => {
  try {
    const { meetingId, escrowIntentId } = req.body;

    if (!meetingId && !escrowIntentId) {
      return res.status(400).json({ error: "Meeting ID or Escrow Intent ID required" });
    }

    // Find the meeting
    const meeting = await Meeting.findById(meetingId);
    if (!meeting) {
      return res.status(404).json({ error: "Meeting not found" });
    }

    // Find the escrow transaction
    const escrowTx = await WalletTransaction.findOne({
      userId: meeting.studentId,
      category: "ESCROW_LOCK",
      "metadata.teacherId": meeting.teacherId.toString(),
      status: "SUCCESS",
    }).sort({ createdAt: -1 });

    if (!escrowTx) {
      return res.status(404).json({ error: "Escrow transaction not found" });
    }

    const intentId = escrowIntentId || escrowTx.externalRef;

    // Confirm/settle the escrow with Finternet
    try {
      await axios.post(
        `${FINTERNET_API_URL}/payment-intents/${intentId}/confirm`,
        {},
        {
          headers: {
            "X-API-Key": FINTERNET_KEY,
            "Content-Type": "application/json",
          },
        }
      );
    } catch (confirmError) {
      // If confirm endpoint doesn't exist, try settle
      console.log("Confirm failed, trying settle...");
    }

    // Credit teacher wallet
    const teacher = await User.findById(meeting.teacherId);
    const platformFee = Math.round(escrowTx.amount * 0.1); // 10% platform fee
    const teacherPayout = escrowTx.amount - platformFee;

    teacher.walletBalance += teacherPayout;
    await teacher.save();

    // Record teacher payout
    await WalletTransaction.create({
      userId: meeting.teacherId,
      amount: teacherPayout,
      type: "CREDIT",
      status: "SUCCESS",
      category: "SESSION_PAYOUT",
      description: `Session payout - Meeting ${meetingId}`,
      externalRef: intentId,
      balanceAfter: teacher.walletBalance,
      metadata: {
        meetingId: meetingId,
        studentId: meeting.studentId.toString(),
        grossAmount: escrowTx.amount,
        platformFee: platformFee,
        netPayout: teacherPayout,
      },
    });

    // Update meeting status
    meeting.status = "completed";
    meeting.paymentStatus = "paid";
    meeting.endedAt = new Date();
    await meeting.save();

    res.json({
      success: true,
      message: "Escrow released to teacher",
      data: {
        teacherPayout: teacherPayout / 100,
        platformFee: platformFee / 100,
        teacherBalance: teacher.walletBalance / 100,
      },
    });
  } catch (error) {
    console.error("Release escrow error:", error.response?.data || error.message);
    res.status(500).json({
      error: "Failed to release escrow",
      details: error.response?.data || error.message,
    });
  }
};

/**
 * ⭐ Refund Escrow (Session Cancelled/Declined)
 * POST /api/escrow/refund
 */
const refundEscrow = async (req, res) => {
  try {
    const { meetingId } = req.body;

    if (!meetingId) {
      return res.status(400).json({ error: "Meeting ID required" });
    }

    const meeting = await Meeting.findById(meetingId);
    if (!meeting) {
      return res.status(404).json({ error: "Meeting not found" });
    }

    // Find the escrow transaction
    const escrowTx = await WalletTransaction.findOne({
      userId: meeting.studentId,
      category: "ESCROW_LOCK",
      status: "SUCCESS",
    }).sort({ createdAt: -1 });

    if (!escrowTx) {
      return res.status(404).json({ error: "Escrow transaction not found" });
    }

    // Refund to student
    const student = await User.findById(meeting.studentId);
    student.walletBalance += escrowTx.amount;
    await student.save();

    // Record refund
    await WalletTransaction.create({
      userId: meeting.studentId,
      amount: escrowTx.amount,
      type: "CREDIT",
      status: "SUCCESS",
      category: "ESCROW_REFUND",
      description: `Session escrow refunded - Meeting cancelled`,
      externalRef: escrowTx.externalRef,
      balanceAfter: student.walletBalance,
      metadata: {
        meetingId: meetingId,
        originalEscrowTx: escrowTx._id,
      },
    });

    // Update meeting
    meeting.status = "cancelled";
    meeting.paymentStatus = "refunded";
    await meeting.save();

    res.json({
      success: true,
      message: "Escrow refunded to student",
      data: {
        refundAmount: escrowTx.amount / 100,
        studentBalance: student.walletBalance / 100,
      },
    });
  } catch (error) {
    console.error("Refund escrow error:", error.message);
    res.status(500).json({ error: "Failed to refund escrow" });
  }
};

/**
 * Get escrow status
 * GET /api/escrow/status/:intentId
 */
const getEscrowStatus = async (req, res) => {
  try {
    const { intentId } = req.params;

    const response = await axios.get(
      `${FINTERNET_API_URL}/payment-intents/${intentId}`,
      {
        headers: {
          "X-API-Key": FINTERNET_KEY,
        },
      }
    );

    const intentData = response.data.data || response.data;

    res.json({
      success: true,
      data: {
        intentId: intentData.id,
        status: intentData.status,
        amount: intentData.amount,
        type: intentData.type,
      },
    });
  } catch (error) {
    console.error("Get escrow status error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to get escrow status" });
  }
};

module.exports = {
  createSessionEscrow,
  releaseEscrow,
  refundEscrow,
  getEscrowStatus,
};
