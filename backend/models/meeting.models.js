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
      enum: ["pending", "accepted", "declined", "completed", "cancelled"],
      default: "pending",
    },
    roomId: {
      type: String,
      default: null,
    },
    // ⭐ STEP 6 - Payment tracking
    sessionPrice: {
      type: Number,
      default: 500, // in cents ($5.00)
    },
    paymentStatus: {
      type: String,
      enum: ["paid", "refunded", "pending"],
      default: "paid",
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
  },
  { timestamps: true },
);

const Meeting = mongoose.model("Meeting", meetingSchema);

module.exports = Meeting;
