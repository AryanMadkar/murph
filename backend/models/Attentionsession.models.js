const mongoose = require("mongoose");

const attentionSessionSchema = new mongoose.Schema(
  {
    meetingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Meeting",
      required: true,
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    roomId: {
      type: String,
      required: true,
    },

    // Session timing
    sessionStartTime: {
      type: Date,
      required: true,
    },
    sessionEndTime: {
      type: Date,
      default: null,
    },
    sessionDuration: {
      type: Number, // in seconds
      default: 0,
    },

    // Raw attention data (frame-by-frame scores)
    attentionScores: [
      {
        timestamp: Date,
        score: Number, // 0-1
        stabilityScore: Number,
        centeringScore: Number,
        faceDetected: Boolean,
      },
    ],

    // Aggregated metrics (calculated at session end)
    metrics: {
      averageAttention: {
        type: Number,
        default: 0,
      },
      maxAttention: {
        type: Number,
        default: 0,
      },
      minAttention: {
        type: Number,
        default: 0,
      },
      consistencyScore: {
        type: Number,
        default: 0,
      },
      longestDistractionFrames: {
        type: Number,
        default: 0,
      },
      sessionMomentum: {
        type: Number,
        default: 0,
      },
      overallEngagement: {
        type: Number,
        default: 0,
      },
      engagementGrade: {
        type: String,
        enum: ["Excellent", "Good", "Fair", "Needs Improvement", "N/A"],
        default: "N/A",
      },
    },

    // Teacher effectiveness score
    teacherEffectiveness: {
      type: Number, // Based on how well they kept student engaged
      default: 0,
    },

    // Session status
    status: {
      type: String,
      enum: ["active", "completed", "aborted"],
      default: "active",
    },
  },
  { timestamps: true },
);

// Index for efficient queries
attentionSessionSchema.index({ meetingId: 1 });
attentionSessionSchema.index({ studentId: 1, createdAt: -1 });
attentionSessionSchema.index({ teacherId: 1, createdAt: -1 });
attentionSessionSchema.index({ roomId: 1 });

const AttentionSession = mongoose.model(
  "AttentionSession",
  attentionSessionSchema,
);

module.exports = AttentionSession;
