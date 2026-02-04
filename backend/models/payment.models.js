const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    // Reference to session
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Session",
      required: true,
    },
    // Reference to student (payer)
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Reference to teacher (payee)
    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // ⭐ MUST TRACK: Finternet Payment Fields
    finternet_intent_id: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    reserved_amount: {
      type: Number,
      required: true,
      min: 0,
    },
    final_amount: {
      type: Number,
      default: null,
      min: 0,
    },
    refund_amount: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: [
        "PENDING",
        "PROCESSING",
        "SUCCEEDED",
        "SETTLED",
        "FAILED",
        "REFUNDED",
        "PARTIALLY_REFUNDED",
      ],
      default: "PENDING",
    },

    // Additional tracking fields
    currency: {
      type: String,
      default: "USDC",
    },
    payment_url: {
      type: String,
      default: null,
    },
    payer_address: {
      type: String,
      default: null,
    },

    // Refund tracking
    refund_id: {
      type: String,
      default: null,
    },
    refund_status: {
      type: String,
      enum: ["PENDING", "PROCESSING", "COMPLETED", "FAILED", null],
      default: null,
    },

    // Teacher payout tracking
    teacher_payout_amount: {
      type: Number,
      default: null,
    },
    teacher_payout_id: {
      type: String,
      default: null,
    },
    teacher_payout_status: {
      type: String,
      enum: ["PENDING", "PROCESSING", "COMPLETED", "FAILED", null],
      default: null,
    },
    platform_fee: {
      type: Number,
      default: null,
    },
    bonus_tier: {
      type: String,
      enum: ["standard", "good", "excellent", null],
      default: null,
    },

    // Timestamps for tracking
    payment_succeeded_at: {
      type: Date,
      default: null,
    },
    settled_at: {
      type: Date,
      default: null,
    },
    refunded_at: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Indexes for common queries
paymentSchema.index({ studentId: 1, status: 1 });
paymentSchema.index({ teacherId: 1, status: 1 });
paymentSchema.index({ status: 1, createdAt: -1 });

const Payment = mongoose.model("Payment", paymentSchema);

module.exports = Payment;
