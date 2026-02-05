const AttentionSession = require("../models/Attentionsession.models");
const Meeting = require("../models/meeting.models");
const User = require("../models/user.models");

/**
 * Calculate analytics from attention scores
 */
const calculateMetrics = (scores) => {
  if (!scores || scores.length === 0) {
    return {
      averageAttention: 0,
      maxAttention: 0,
      minAttention: 0,
      consistencyScore: 0,
      longestDistractionFrames: 0,
      sessionMomentum: 0,
      overallEngagement: 0,
      engagementGrade: "N/A",
    };
  }

  const attentionValues = scores.map((s) => s.score);

  // Basic stats
  const averageAttention =
    attentionValues.reduce((a, b) => a + b, 0) / attentionValues.length;
  const maxAttention = Math.max(...attentionValues);
  const minAttention = Math.min(...attentionValues);

  // Consistency (lower variance = better)
  const variance =
    attentionValues.reduce((sum, val) => {
      return sum + Math.pow(val - averageAttention, 2);
    }, 0) / attentionValues.length;
  const consistencyScore = 1 / (1 + variance * 5);

  // Longest distraction (consecutive frames below 0.4)
  let longestDistractionFrames = 0;
  let currentDistraction = 0;
  attentionValues.forEach((score) => {
    if (score < 0.4) {
      currentDistraction++;
      longestDistractionFrames = Math.max(
        longestDistractionFrames,
        currentDistraction,
      );
    } else {
      currentDistraction = 0;
    }
  });

  // Session momentum (first half vs second half)
  let sessionMomentum = 0;
  if (attentionValues.length >= 20) {
    const mid = Math.floor(attentionValues.length / 2);
    const firstHalf = attentionValues.slice(0, mid);
    const secondHalf = attentionValues.slice(mid);

    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

    sessionMomentum = secondAvg - firstAvg;
  }

  // Overall engagement grade
  const overallEngagement =
    averageAttention * 0.4 +
    consistencyScore * 0.3 +
    (1 - longestDistractionFrames / Math.max(attentionValues.length, 1)) * 0.3;

  let engagementGrade;
  if (overallEngagement >= 0.8) engagementGrade = "Excellent";
  else if (overallEngagement >= 0.6) engagementGrade = "Good";
  else if (overallEngagement >= 0.4) engagementGrade = "Fair";
  else engagementGrade = "Needs Improvement";

  return {
    averageAttention: parseFloat(averageAttention.toFixed(3)),
    maxAttention: parseFloat(maxAttention.toFixed(3)),
    minAttention: parseFloat(minAttention.toFixed(3)),
    consistencyScore: parseFloat(consistencyScore.toFixed(3)),
    longestDistractionFrames,
    sessionMomentum: parseFloat(sessionMomentum.toFixed(3)),
    overallEngagement: parseFloat(overallEngagement.toFixed(3)),
    engagementGrade,
  };
};

/**
 * Calculate teacher effectiveness
 */
const calculateTeacherEffectiveness = (metrics) => {
  const effectiveness =
    metrics.averageAttention * 0.5 +
    metrics.consistencyScore * 0.3 +
    metrics.overallEngagement * 0.2;

  return parseFloat(effectiveness.toFixed(3));
};

/**
 * Start a new attention tracking session
 */
const startAttentionSession = async (req, res) => {
  try {
    const { meetingId, studentId, teacherId, roomId } = req.body;

    if (!meetingId || !studentId || !teacherId || !roomId) {
      return res
        .status(400)
        .json({ success: false, message: "Missing required fields" });
    }

    const attentionSession = new AttentionSession({
      meetingId,
      studentId,
      teacherId,
      roomId,
      sessionStartTime: new Date(),
      attentionScores: [],
    });

    await attentionSession.save();

    res.status(201).json({ success: true, sessionId: attentionSession._id });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Record attention data point
 */
const recordAttentionData = async (req, res) => {
  try {
    const { sessionId, score, stabilityScore, centeringScore, faceDetected } =
      req.body;

    const session = await AttentionSession.findById(sessionId);
    if (!session || session.status !== "active") {
      return res
        .status(400)
        .json({ success: false, message: "Invalid session" });
    }

    session.attentionScores.push({
      timestamp: new Date(),
      score: parseFloat(score),
      stabilityScore: parseFloat(stabilityScore || 0),
      centeringScore: parseFloat(centeringScore || 0),
      faceDetected: faceDetected !== false,
    });

    await session.save();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * End attention session and calculate metrics
 */
const endAttentionSession = async (req, res) => {
  try {
    const { sessionId } = req.body;

    const session = await AttentionSession.findById(sessionId);
    if (!session || session.status !== "active") {
      return res
        .status(400)
        .json({ success: false, message: "Invalid session" });
    }

    session.sessionEndTime = new Date();
    session.sessionDuration = Math.floor(
      (session.sessionEndTime - session.sessionStartTime) / 1000,
    );

    const metrics = calculateMetrics(session.attentionScores);
    session.metrics = metrics;
    session.teacherEffectiveness = calculateTeacherEffectiveness(metrics);
    session.status = "completed";

    await session.save();

    res.json({ success: true, metrics: session.metrics });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get attention session details
 */
const getAttentionSession = async (req, res) => {
  try {
    const session = await AttentionSession.findById(req.params.sessionId)
      .populate("studentId", "email")
      .populate("teacherId", "email");
    res.json({ success: true, session });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get live attention status for active session
 */
const getLiveAttentionStatus = async (req, res) => {
  try {
    const { roomId } = req.params;
    const session = await AttentionSession.findOne({
      roomId,
      status: "active",
    });
    if (!session)
      return res
        .status(404)
        .json({ success: false, message: "No active session" });

    res.json({ success: true, sessionId: session._id });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  startAttentionSession,
  recordAttentionData,
  endAttentionSession,
  getAttentionSession,
  getLiveAttentionStatus,
  calculateMetrics,
  calculateTeacherEffectiveness,
};
