const mongoose = require("mongoose");

const meetingSchema = new mongoose.Schema(
  {
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
    status: {
      type: String,
      enum: [
        "pending",
        "accepted",
        "active",
        "declined",
        "completed",
        "cancelled",
      ],
      default: "pending",
    },
    roomId: {
      type: String,
      default: null,
    },
    // ⭐ Escrow Payment System
    sessionPrice: {
      type: Number,
      default: 500, // in cents ($5.00)
    },
    platformFee: {
      type: Number,
      default: 50, // 10% platform fee (50 cents)
    },
    teacherEarning: {
      type: Number,
      default: 450, // 90% to teacher ($4.50)
    },
    paymentStatus: {
      type: String,
      enum: ["escrow", "released", "refunded", "pending"],
      default: "pending",
    },
    // Session timing (for pay-per-minute if needed later)
    startedAt: {
      type: Date,
      default: null,
    },
    endedAt: {
      type: Date,
      default: null,
    },
    durationMinutes: {
      type: Number,
      default: 0,
    },
    // ⭐ Pay-per-use billing fields
    escrowLocked: {
      type: Number,
      default: 0, // Amount locked in escrow (in cents)
    },
    finalCharge: {
      type: Number,
      default: 0, // Final amount charged after session
    },
  },
  { timestamps: true },
);

const Meeting = mongoose.model("Meeting", meetingSchema);

module.exports = Meeting;
