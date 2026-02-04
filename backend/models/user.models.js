const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      default: null,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    role: {
      type: String,
      enum: ["teacher", "student"],
      required: true,
    },
    embedding: {
      type: [Number],
      required: true,
    },
    
    // ⭐ WALLET - Store balance in paise (1 USD = 100 paise/cents)
    walletBalance: {
      type: Number,
      default: 0,
      min: 0,
    },
    
    // Bank account for teacher payouts
    bankAccount: {
      accountId: { type: String, default: null },
      accountName: { type: String, default: null },
      isVerified: { type: Boolean, default: false },
    },
  },
  { timestamps: true },
);

// Virtual to get balance in dollars
userSchema.virtual("balanceInDollars").get(function () {
  return this.walletBalance / 100;
});

// Method to add funds (in paise)
userSchema.methods.addFunds = async function (amountInPaise) {
  this.walletBalance += amountInPaise;
  return this.save();
};

// Method to deduct funds (in paise)
userSchema.methods.deductFunds = async function (amountInPaise) {
  if (this.walletBalance < amountInPaise) {
    throw new Error("Insufficient balance");
  }
  this.walletBalance -= amountInPaise;
  return this.save();
};

// Method to check if user has sufficient balance
userSchema.methods.hasSufficientBalance = function (amountInPaise) {
  return this.walletBalance >= amountInPaise;
};

// Include virtuals in JSON
userSchema.set("toJSON", { virtuals: true });
userSchema.set("toObject", { virtuals: true });

const User = mongoose.model("User", userSchema);

module.exports = User;
