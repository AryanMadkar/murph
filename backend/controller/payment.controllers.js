const Razorpay = require("razorpay");
const crypto = require("crypto");
const User = require("../models/user.models");
const WalletTransaction = require("../models/walletTransaction.models");

// Initialize Razorpay
// If env vars are missing, this might crash, so good to check.
// For "Dummy Money" request, we can also add a "free add" endpoint if Razorpay is too much.
// But user previously had Razorpay, so I will stick with it AND add a free "dev" endpoint.
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || "rzp_test_missing",
  key_secret: process.env.RAZORPAY_KEY_SECRET || "missing",
});

const createPaymentIntent = async (req, res) => {
  try {
    const { userId, amount } = req.body;

    if (!userId || !amount) {
      return res.status(400).json({ error: "User ID and amount are required" });
    }

    if (amount < 1) {
      return res.status(400).json({ error: "Minimum amount is ₹1" });
    }

    const tx = await WalletTransaction.create({
      userId,
      amount,
      type: "CREDIT",
      status: "PENDING",
    });

    const order = await razorpay.orders.create({
      amount: Math.round(amount * 100),
      currency: "INR",
      receipt: tx._id.toString(),
      notes: {
        userId,
        transactionId: tx._id.toString(),
      },
    });

    tx.intentId = order.id;
    await tx.save();

    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    console.error("Create payment order error:", error);
    res.status(500).json({
      error: "Failed to create payment order",
      details: error.message,
    });
  }
};

const verifyPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      req.body;

    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ error: "Invalid signature" });
    }

    const tx = await WalletTransaction.findOne({ intentId: razorpay_order_id });
    if (!tx) return res.status(404).json({ error: "Transaction not found" });

    if (tx.status === "SUCCESS") {
      return res.json({ success: true, message: "Already verified" });
    }

    tx.status = "SUCCESS";
    await tx.save();

    await User.findByIdAndUpdate(tx.userId, {
      $inc: { walletBalance: tx.amount },
    });

    res.json({ success: true, message: "Payment verified successfully" });
  } catch (error) {
    console.error("Verify error:", error);
    res.status(500).json({ error: error.message });
  }
};

const getWalletBalance = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId);
    const transactions = await WalletTransaction.find({ userId }).sort({
      createdAt: -1,
    });
    res.json({
      balance: user ? user.walletBalance : 0,
      transactions,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch wallet info" });
  }
};

module.exports = {
  createPaymentIntent,
  verifyPayment,
  getWalletBalance,
};
