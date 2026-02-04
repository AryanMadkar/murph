const mongoose = require("mongoose");

const sessionSchema = new mongoose.Schema(
  {
    // Reference to meeting request
    meetingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Meeting",
      default: null,
    },
    // Participants
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

    // ⭐ MUST TRACK: Session Time Fields
    start_time: {
      type: Date,
      default: null,
    },
    end_time: {
      type: Date,
      default: null,
    },

    // ⭐ MUST TRACK: Rate & Pricing
    rate: {
      type: Number,
      required: true,
      min: 0,
      // Rate per minute (e.g., 0.50 = $0.50/min)
    },
    max_budget: {
      type: Number,
      required: true,
      min: 0,
    },

    // ⭐ MUST TRACK: Quality Scores
    engagement_score: {
      type: Number,
      default: null,
      min: 0,
      max: 1,
      // Score from 0.0 to 1.0 from attention tracking AI
    },
    review_score: {
      type: Number,
      default: null,
      min: 1,
      max: 5,
      // Student's rating 1-5 stars
    },
    review_comment: {
      type: String,
      default: null,
    },

    // Session status
    status: {
      type: String,
      enum: [
        "RESERVED",      // Payment intent created
        "READY",         // Payment confirmed, ready to start
        "ACTIVE",        // Session in progress
        "PAUSED",        // Session paused
        "COMPLETED",     // Session ended normally
        "CANCELLED",     // Cancelled before start
        "FAILED",        // Payment failed
      ],
      default: "RESERVED",
    },

    // Calculated fields (stored after session ends)
    duration_minutes: {
      type: Number,
      default: null,
    },
    final_cost: {
      type: Number,
      default: null,
    },

    // Reference to payment
    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment",
      default: null,
    },

    // Attention tracking data snapshots (stored periodically)
    attention_snapshots: [
      {
        timestamp: Date,
        score: Number,
        is_attentive: Boolean,
      },
    ],

    // Session metadata
    subject: {
      type: String,
      default: null,
    },
    description: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

// Indexes for common queries
sessionSchema.index({ studentId: 1, status: 1 });
sessionSchema.index({ teacherId: 1, status: 1 });
sessionSchema.index({ status: 1, createdAt: -1 });
sessionSchema.index({ roomId: 1 }, { unique: true });

// Virtual for duration calculation
sessionSchema.virtual("calculated_duration").get(function () {
  if (this.start_time && this.end_time) {
    return (this.end_time - this.start_time) / (1000 * 60); // minutes
  }
  return null;
});

// Virtual for calculated cost
sessionSchema.virtual("calculated_cost").get(function () {
  const duration = this.calculated_duration;
  if (duration !== null && this.rate) {
    return Math.min(duration * this.rate, this.max_budget);
  }
  return null;
});

// Include virtuals in JSON output
sessionSchema.set("toJSON", { virtuals: true });
sessionSchema.set("toObject", { virtuals: true });

const Session = mongoose.model("Session", sessionSchema);

module.exports = Session;
