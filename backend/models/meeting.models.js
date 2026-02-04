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
      enum: ["pending", "accepted", "rejected", "completed", "cancelled"],
      default: "pending",
    },
    roomId: {
      type: String,
      default: null,
    },
    amount: {
      type: Number,
      default: 100, // Default session price
    },
    paymentStatus: {
      type: String,
      enum: ["held", "transferred", "refunded"],
      default: "held",
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

const Meeting = mongoose.model("Meeting", meetingSchema);

module.exports = Meeting;
