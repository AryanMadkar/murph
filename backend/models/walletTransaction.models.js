const mongoose = require("mongoose");

const walletTransactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    intentId: {
      type: String,
      // Stores Razorpay Order ID for CREDIT
    },
    amount: {
      type: Number,
      required: true,
    },
    type: {
      // CREDIT: Adding money to wallet
      // DEBIT: Spending money (e.g. for meetings) - though meeting logic handles debit internally on User model,
      // we might want to record it here too for history, but currently meeting logic doesn't use this model.
      // This model is primarily used by payment.controllers.js for Top-ups.
      type: String,
      enum: ["CREDIT", "DEBIT"],
      required: true,
    },
    status: {
      type: String,
      enum: ["PENDING", "SUCCESS", "FAILED"],
      default: "PENDING",
    },
  },
  { timestamps: true },
);

const WalletTransaction = mongoose.model(
  "WalletTransaction",
  walletTransactionSchema,
);

module.exports = WalletTransaction;
