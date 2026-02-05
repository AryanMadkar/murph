const Meeting = require("../models/meeting.models");
const User = require("../models/user.models");
const SessionUsage = require("../models/sessionUsage.models");
const WalletTransaction = require("../models/walletTransaction.models");
const { emitWalletUpdate } = require("../socket/socket");

// ⭐ PRICING CONFIG
const PRICING = {
  pricePerMinute: 100, // $1.00 in cents
  maxDuration: 60, // minutes
  platformFeePercent: 10,
  gracePeriodSeconds: 30, // free reconnection time
  heartbeatInterval: 30000, // 30 seconds
  disconnectThreshold: 60000 // 1 minute = considered disconnected
};

/**
 * ⭐ START SESSION - Lock escrow and begin tracking
 * POST /api/session/start/:meetingId
 */
const startSession = async (req, res) => {
  try {
    const { meetingId } = req.params;
    const meeting = await Meeting.findById(meetingId);
    
    if (!meeting) {
      return res.status(404).json({ error: "Meeting not found" });
    }
    
    if (meeting.status !== "accepted") {
      return res.status(400).json({ error: "Meeting must be accepted first" });
    }
    
    // Check if session already active
    const existingSession = await SessionUsage.findOne({
      meetingId,
      status: "ACTIVE"
    });
    
    if (existingSession) {
      return res.json({
        success: true,
        message: "Session already active",
        sessionId: existingSession._id,
        joinTime: existingSession.joinTime
      });
    }
    
    // Get student and verify balance
    const student = await User.findById(meeting.studentId);
    const escrowAmount = PRICING.pricePerMinute * PRICING.maxDuration;
    
    if (student.walletBalance < escrowAmount) {
      return res.status(400).json({
        error: "Insufficient balance",
        required: escrowAmount / 100,
        available: student.walletBalance / 100
      });
    }
    
    // Lock escrow
    student.walletBalance -= escrowAmount;
    await student.save();
    
    // Create wallet transaction for escrow
    await WalletTransaction.create({
      userId: student._id,
      amount: escrowAmount,
      type: "DEBIT",
      status: "SUCCESS",
      category: "ESCROW_LOCK",
      description: `Escrow locked for session (max ${PRICING.maxDuration} min)`,
      balanceAfter: student.walletBalance,
      metadata: { meetingId }
    });
    
    // Update meeting
    meeting.escrowLocked = escrowAmount;
    meeting.status = "active";
    meeting.startedAt = new Date();
    await meeting.save();
    
    // Create session usage record
    const session = await SessionUsage.create({
      meetingId,
      joinTime: new Date(),
      lastHeartbeat: new Date(),
      heartbeats: [{ timestamp: new Date(), status: "ACTIVE" }],
      status: "ACTIVE"
    });
    
    // Notify student
    emitWalletUpdate(student._id, {
      type: "ESCROW_LOCK",
      amount: escrowAmount / 100,
      newBalance: student.walletBalance / 100,
      message: `$${(escrowAmount / 100).toFixed(2)} held in escrow`
    });
    
    res.json({
      success: true,
      message: "Session started",
      sessionId: session._id,
      escrowLocked: escrowAmount / 100,
      maxDuration: PRICING.maxDuration,
      pricePerMinute: PRICING.pricePerMinute / 100,
      newBalance: student.walletBalance / 100
    });
    
  } catch (error) {
    console.error("Start session error:", error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * ⭐ HEARTBEAT - Track active session every 30 seconds
 * POST /api/session/heartbeat/:meetingId
 */
const heartbeat = async (req, res) => {
  try {
    const { meetingId } = req.params;
    const { userId } = req.body;
    
    const session = await SessionUsage.findOne({
      meetingId,
      status: "ACTIVE"
    });
    
    if (!session) {
      return res.status(404).json({ error: "No active session" });
    }
    
    const now = new Date();
    const lastBeat = session.lastHeartbeat;
    const timeSinceLastBeat = now - lastBeat;
    
    // Check if was disconnected (>1 minute since last heartbeat)
    if (timeSinceLastBeat > PRICING.disconnectThreshold) {
      // Record disconnection
      const lastDisconnect = session.disconnections.slice(-1)[0];
      
      if (!lastDisconnect || lastDisconnect.reconnectTime) {
        // New disconnection period ended
        session.disconnections.push({
          disconnectTime: lastBeat,
          reconnectTime: now,
          duration: Math.floor(timeSinceLastBeat / 1000)
        });
        
        // Update total disconnect time (minus grace period)
        const disconnectSeconds = Math.floor(timeSinceLastBeat / 1000);
        session.totalDisconnectTime += Math.max(0, disconnectSeconds - PRICING.gracePeriodSeconds);
      }
    }
    
    // Update heartbeat
    session.lastHeartbeat = now;
    session.heartbeats.push({ timestamp: now, status: "ACTIVE" });
    
    // Keep only last 100 heartbeats
    if (session.heartbeats.length > 100) {
      session.heartbeats = session.heartbeats.slice(-100);
    }
    
    await session.save();
    
    // Calculate current usage
    const currentDuration = Math.floor((now - session.joinTime) / 1000);
    const billableSeconds = session.calculateBillableTime();
    const currentCost = Math.ceil(billableSeconds / 60) * PRICING.pricePerMinute;
    
    res.json({
      success: true,
      currentDuration: Math.floor(currentDuration / 60), // minutes
      billableMinutes: Math.ceil(billableSeconds / 60),
      currentCost: currentCost / 100,
      maxCost: (PRICING.pricePerMinute * PRICING.maxDuration) / 100
    });
    
  } catch (error) {
    console.error("Heartbeat error:", error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * ⭐ END SESSION - Calculate final bill and settle
 * POST /api/session/end/:meetingId
 */
const endSession = async (req, res) => {
  try {
    const { meetingId } = req.params;
    const { rating } = req.body; // Optional student rating
    
    const meeting = await Meeting.findById(meetingId);
    if (!meeting) {
      return res.status(404).json({ error: "Meeting not found" });
    }
    
    const session = await SessionUsage.findOne({
      meetingId,
      status: "ACTIVE"
    });
    
    if (!session) {
      return res.status(404).json({ error: "No active session found" });
    }
    
    // Set end time
    session.leaveTime = new Date();
    session.status = "COMPLETED";
    
    // Add rating if provided
    if (rating) {
      session.studentRating = rating;
    }
    
    // Calculate billable time
    session.actualDuration = Math.floor((session.leaveTime - session.joinTime) / 1000);
    session.billableDuration = session.calculateBillableTime();
    
    // Get billing breakdown with tiers
    const billing = session.getBillingBreakdown(PRICING.pricePerMinute);
    
    // Calculate amounts
    const finalCharge = Math.round(billing.finalAmount);
    const platformFee = Math.round(finalCharge * PRICING.platformFeePercent / 100);
    const teacherEarning = finalCharge - platformFee;
    const refund = meeting.escrowLocked - finalCharge;
    
    // Get users
    const student = await User.findById(meeting.studentId);
    const teacher = await User.findById(meeting.teacherId);
    
    // Refund unused escrow to student
    if (refund > 0) {
      student.walletBalance += refund;
      await student.save();
      
      await WalletTransaction.create({
        userId: student._id,
        amount: refund,
        type: "CREDIT",
        status: "SUCCESS",
        category: "ESCROW_REFUND",
        description: `Unused escrow refund (${billing.totalMinutes} min used)`,
        balanceAfter: student.walletBalance,
        metadata: { meetingId, billing }
      });
      
      emitWalletUpdate(student._id, {
        type: "ESCROW_REFUND",
        amount: refund / 100,
        newBalance: student.walletBalance / 100,
        message: `$${(refund / 100).toFixed(2)} refunded (unused time)`
      });
    }
    
    // Pay teacher
    teacher.walletBalance += teacherEarning;
    await teacher.save();
    
    await WalletTransaction.create({
      userId: teacher._id,
      amount: teacherEarning,
      type: "CREDIT",
      status: "SUCCESS",
      category: "SESSION_PAYOUT",
      description: `Session payment (${billing.totalMinutes} min @ tiered rates)`,
      balanceAfter: teacher.walletBalance,
      metadata: { meetingId, billing }
    });
    
    emitWalletUpdate(teacher._id, {
      type: "SESSION_PAYOUT",
      amount: teacherEarning / 100,
      newBalance: teacher.walletBalance / 100,
      message: `$${(teacherEarning / 100).toFixed(2)} earned from session`
    });
    
    // Update meeting
    meeting.status = "completed";
    meeting.endedAt = new Date();
    meeting.durationMinutes = billing.totalMinutes;
    meeting.finalCharge = finalCharge;
    meeting.platformFee = platformFee;
    meeting.teacherEarning = teacherEarning;
    meeting.paymentStatus = "settled";
    await meeting.save();
    
    // Save session
    await session.save();
    
    // Generate detailed bill
    const bill = {
      invoiceId: `INV-${Date.now().toString(36).toUpperCase()}`,
      sessionId: session._id,
      meetingId: meeting._id,
      
      timing: {
        startTime: session.joinTime,
        endTime: session.leaveTime,
        actualDuration: Math.round(session.actualDuration / 60),
        billableDuration: billing.totalMinutes,
        disconnections: session.disconnections.length,
        totalDisconnectTime: Math.round(session.totalDisconnectTime / 60)
      },
      
      billing: {
        tiers: billing.tiers.map(t => ({
          ...t,
          rate: t.rate / 100,
          amount: t.amount / 100
        })),
        subtotal: billing.subtotal / 100,
        qualityAdjustment: billing.qualityAdjustment / 100,
        finalCharge: finalCharge / 100,
        platformFee: platformFee / 100,
        teacherEarning: teacherEarning / 100,
        studentRefund: refund / 100
      },
      
      student: {
        id: student._id,
        email: student.email,
        newBalance: student.walletBalance / 100
      },
      
      teacher: {
        id: teacher._id,
        email: teacher.email,
        newBalance: teacher.walletBalance / 100
      },
      
      rating: session.studentRating || "Not rated",
      status: "SETTLED"
    };
    
    res.json({
      success: true,
      message: "Session completed and billed",
      bill
    });
    
  } catch (error) {
    console.error("End session error:", error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * ⭐ PAUSE SESSION - Pause billing temporarily
 * POST /api/session/pause/:meetingId
 */
const pauseSession = async (req, res) => {
  try {
    const { meetingId } = req.params;
    
    const session = await SessionUsage.findOne({
      meetingId,
      status: "ACTIVE"
    });
    
    if (!session) {
      return res.status(404).json({ error: "No active session" });
    }
    
    session.status = "PAUSED";
    session.heartbeats.push({ timestamp: new Date(), status: "PAUSED" });
    await session.save();
    
    res.json({
      success: true,
      message: "Session paused - billing stopped temporarily"
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * ⭐ RESUME SESSION - Resume billing
 * POST /api/session/resume/:meetingId
 */
const resumeSession = async (req, res) => {
  try {
    const { meetingId } = req.params;
    
    const session = await SessionUsage.findOne({
      meetingId,
      status: "PAUSED"
    });
    
    if (!session) {
      return res.status(404).json({ error: "No paused session" });
    }
    
    session.status = "ACTIVE";
    session.lastHeartbeat = new Date();
    session.heartbeats.push({ timestamp: new Date(), status: "ACTIVE" });
    await session.save();
    
    res.json({
      success: true,
      message: "Session resumed"
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * ⭐ GET SESSION STATUS - Current usage and cost
 * GET /api/session/status/:meetingId
 */
const getSessionStatus = async (req, res) => {
  try {
    const { meetingId } = req.params;
    
    const session = await SessionUsage.findOne({ meetingId });
    const meeting = await Meeting.findById(meetingId);
    
    if (!session || !meeting) {
      return res.status(404).json({ error: "Session not found" });
    }
    
    const now = new Date();
    const currentDuration = session.leaveTime 
      ? Math.floor((session.leaveTime - session.joinTime) / 1000)
      : Math.floor((now - session.joinTime) / 1000);
    
    const billableSeconds = session.calculateBillableTime();
    const billing = session.getBillingBreakdown(PRICING.pricePerMinute);
    
    res.json({
      success: true,
      session: {
        id: session._id,
        status: session.status,
        joinTime: session.joinTime,
        leaveTime: session.leaveTime,
        currentDurationMinutes: Math.floor(currentDuration / 60),
        billableMinutes: Math.ceil(billableSeconds / 60),
        disconnections: session.disconnections.length,
        rating: session.studentRating
      },
      billing: {
        tiers: billing.tiers.map(t => ({
          ...t,
          rate: t.rate / 100,
          amount: t.amount / 100
        })),
        currentCost: billing.finalAmount / 100,
        maxCost: (PRICING.pricePerMinute * PRICING.maxDuration) / 100
      },
      escrow: {
        locked: meeting.escrowLocked / 100,
        used: billing.finalAmount / 100,
        remaining: (meeting.escrowLocked - billing.finalAmount) / 100
      }
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  startSession,
  heartbeat,
  endSession,
  pauseSession,
  resumeSession,
  getSessionStatus,
  PRICING
};
