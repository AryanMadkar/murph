const mongoose = require("mongoose");

/**
 * Wallet Transaction Ledger
 *
 * CRITICAL for fintech:
 * ✔ Refund support
 * ✔ Audit trail
 * ✔ Payment verification
 * ✔ Fraud safety
 */

const walletTransactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Amount in paise/cents (1 USD = 100)
    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    // Transaction type
    type: {
      type: String,
      enum: ["CREDIT", "DEBIT"],
      required: true,
    },

    // Transaction status
    status: {
      type: String,
      enum: ["SUCCESS", "FAILED", "PENDING"],
      default: "PENDING",
    },

    // Human-readable description
    description: {
      type: String,
      required: true,
    },

    // Category for filtering/reporting
    category: {
      type: String,
      enum: [
        "TOPUP", // Wallet recharge
        "SESSION", // Legacy session category
        "SESSION_PAYMENT", // Pay for session
        "SESSION_EARNING", // Teacher earns from session
        "REFUND", // Refund to student
        "BONUS", // Quality bonus for teacher
        "WITHDRAWAL", // Withdraw to bank
        "PLATFORM_FEE", // Murph platform fee
        "ADJUSTMENT", // Manual adjustment
        "ESCROW_LOCK", // Lock for escrow payment
        "MATERIAL_PURCHASE", // Student buys a video/doc
        "MATERIAL_EARNING", // Teacher earns from video/doc sale
      ],
      required: true,
    },

    // Reference to related entities
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Session",
      default: null,
    },
    materialId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Material",
      default: null,
    },
    paymentIntentId: {
      type: String,
      default: null,
    },

    // Balance after this transaction (snapshot)
    balanceAfter: {
      type: Number,
      default: null,
    },

    // External reference (Finternet transaction ID, etc.)
    externalRef: {
      type: String,
      default: null,
    },

    // ⭐ CRITICAL: Processed flag to prevent double-crediting
    processed: {
      type: Boolean,
      default: false,
      index: true,
    },

    // When the transaction was processed
    processedAt: {
      type: Date,
      default: null,
    },

    // Failure reason if failed
    failureReason: {
      type: String,
      default: null,
    },

    // Webhook data for audit
    webhookData: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    // Metadata for additional info
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true },
);

// Indexes for common queries
walletTransactionSchema.index({ userId: 1, createdAt: -1 });
walletTransactionSchema.index({ userId: 1, type: 1, status: 1 });
walletTransactionSchema.index({ sessionId: 1 });
walletTransactionSchema.index({ paymentIntentId: 1 });
walletTransactionSchema.index({ status: 1, createdAt: -1 });

// Virtual for amount in dollars
walletTransactionSchema.virtual("amountInDollars").get(function () {
  return this.amount / 100;
});

// Static method to create a credit transaction
walletTransactionSchema.statics.credit = async function (
  userId,
  amount,
  category,
  description,
  options = {},
) {
  const User = mongoose.model("User");
  const user = await User.findById(userId);

  if (!user) {
    throw new Error("User not found");
  }

  // Add funds to user wallet
  await user.addFunds(amount);

  // Create transaction record
  const transaction = await this.create({
    userId,
    amount,
    type: "CREDIT",
    status: "SUCCESS",
    category,
    description,
    balanceAfter: user.walletBalance,
    sessionId: options.sessionId || null,
    paymentIntentId: options.paymentIntentId || null,
    externalRef: options.externalRef || null,
    metadata: options.metadata || {},
  });

  return transaction;
};

// Static method to create a debit transaction
walletTransactionSchema.statics.debit = async function (
  userId,
  amount,
  category,
  description,
  options = {},
) {
  const User = mongoose.model("User");
  const user = await User.findById(userId);

  if (!user) {
    throw new Error("User not found");
  }

  if (!user.hasSufficientBalance(amount)) {
    // Create failed transaction record
    await this.create({
      userId,
      amount,
      type: "DEBIT",
      status: "FAILED",
      category,
      description: `${description} (Insufficient balance)`,
      balanceAfter: user.walletBalance,
      sessionId: options.sessionId || null,
      metadata: { reason: "INSUFFICIENT_BALANCE" },
    });
    throw new Error("Insufficient balance");
  }

  // Deduct funds from user wallet
  await user.deductFunds(amount);

  // Create transaction record
  const transaction = await this.create({
    userId,
    amount,
    type: "DEBIT",
    status: "SUCCESS",
    category,
    description,
    balanceAfter: user.walletBalance,
    sessionId: options.sessionId || null,
    paymentIntentId: options.paymentIntentId || null,
    externalRef: options.externalRef || null,
    metadata: options.metadata || {},
  });

  return transaction;
};

// Static method to get user's transaction history
walletTransactionSchema.statics.getHistory = function (userId, options = {}) {
  const query = { userId, status: "SUCCESS" };

  if (options.type) query.type = options.type;
  if (options.category) query.category = options.category;

  return this.find(query)
    .sort({ createdAt: -1 })
    .limit(options.limit || 50)
    .skip(options.skip || 0);
};

// Static method to get transaction summary
walletTransactionSchema.statics.getSummary = async function (userId) {
  const result = await this.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        status: "SUCCESS",
      },
    },
    {
      $group: {
        _id: "$type",
        total: { $sum: "$amount" },
        count: { $sum: 1 },
      },
    },
  ]);

  const summary = { credits: 0, debits: 0, creditCount: 0, debitCount: 0 };

  result.forEach((r) => {
    if (r._id === "CREDIT") {
      summary.credits = r.total;
      summary.creditCount = r.count;
    } else {
      summary.debits = r.total;
      summary.debitCount = r.count;
    }
  });

  summary.net = summary.credits - summary.debits;

  return summary;
};

// Include virtuals in JSON
walletTransactionSchema.set("toJSON", { virtuals: true });
walletTransactionSchema.set("toObject", { virtuals: true });

const WalletTransaction = mongoose.model(
  "WalletTransaction",
  walletTransactionSchema,
);

module.exports = WalletTransaction;
