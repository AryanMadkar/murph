const User = require("../models/user.models");
const WalletTransaction = require("../models/walletTransaction.models");
const axios = require("axios");
const crypto = require("crypto");

// ⭐ Finternet API Config
const FINTERNET_BASE_URL = "https://api.fmm.finternetlab.io";
const FINTERNET_KEY = process.env.FINTERNET_API_KEY || "sk_hackathon_8dfa4676767f125bd20b1e2d03d39490";
const WEBHOOK_SECRET = process.env.FINTERNET_WEBHOOK_SECRET || "whsec_murph_secret";

// Axios instance for Finternet
const finternetAPI = axios.create({
  baseURL: FINTERNET_BASE_URL,
  headers: {
    "X-API-Key": FINTERNET_KEY,
    "Content-Type": "application/json"
  },
  timeout: 30000
});

// ═══════════════════════════════════════════════════════════════════
// 📊 WALLET BALANCE & TRANSACTIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Get wallet balance
 * GET /api/wallet/balance
 */
const getBalance = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      success: true,
      balance: user.walletBalance / 100,
      balanceInCents: user.walletBalance,
      balanceFormatted: `$${(user.walletBalance / 100).toFixed(2)}`
    });
  } catch (error) {
    console.error("Get balance error:", error);
    res.status(500).json({ error: "Failed to get balance" });
  }
};

/**
 * Get transaction history
 * GET /api/wallet/transactions
 */
const getTransactions = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const { limit = 20, skip = 0 } = req.query;

    const transactions = await WalletTransaction.find({ userId })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip));

    res.json({
      success: true,
      transactions
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to get transactions" });
  }
};

// ═══════════════════════════════════════════════════════════════════
// 💰 STEP 1 & 2: CREATE PAYMENT INTENT (Real Money Entry Begins)
// ═══════════════════════════════════════════════════════════════════

/**
 * ⭐ Create Wallet Topup Intent (CONSENTED_PULL)
 * POST /api/wallet/create-topup
 * 
 * Flow:
 * 1. Student clicks "Add Money"
 * 2. Backend creates Finternet Payment Intent
 * 3. Returns paymentUrl for student to complete payment
 * 4. Student is redirected to Finternet payment page
 */
const createTopupIntent = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const { amount } = req.body;

    if (!amount || amount < 1) {
      return res.status(400).json({ error: "Minimum top-up is $1" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // ⭐ Create Finternet Payment Intent
    const payload = {
      amount: amount.toString(),
      currency: "USD",
      type: "CONSENTED_PULL",
      settlementMethod: "OFF_RAMP_MOCK",
      settlementDestination: "murph_wallet",
      description: `Murph Wallet Top-up - $${amount}`,
      metadata: {
        userId: userId.toString(),
        userEmail: user.email,
        type: "WALLET_TOPUP",
        platform: "murph"
      }
    };

    console.log("[Topup] Creating Finternet intent:", payload);

    const response = await finternetAPI.post("/api/v1/payment-intents", payload);
    const intentData = response.data.data || response.data;

    console.log("[Topup] Finternet response:", intentData);

    // ⭐ Store PENDING transaction (DO NOT credit wallet yet!)
    await WalletTransaction.create({
      userId,
      amount: Math.round(amount * 100),
      type: "CREDIT",
      status: "PENDING",
      category: "TOPUP",
      description: `Wallet top-up - $${amount}`,
      paymentIntentId: intentData.id,
      externalRef: intentData.id,
      processed: false // ⚠️ Important: Not processed until verified
    });

    // ⭐ Return payment URL for frontend to redirect
    res.json({
      success: true,
      intentId: intentData.id,
      status: intentData.status || "INITIATED",
      paymentUrl: intentData.paymentUrl,
      amount,
      currency: "USD",
      message: "Redirect user to paymentUrl to complete payment"
    });

  } catch (error) {
    console.error("[Topup] Finternet API Error:", error.response?.data || error.message);
    
    res.status(500).json({
      success: false,
      error: "Failed to create payment intent",
      details: error.response?.data || error.message
    });
  }
};

/**
 * ⭐ Create Session Escrow Payment (DELIVERY_VS_PAYMENT)
 * POST /api/wallet/create-escrow
 * 
 * For session payments with escrow protection
 */
const createEscrowPayment = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const { amount, sessionId, teacherId } = req.body;

    if (!amount || amount < 0.01) {
      return res.status(400).json({ error: "Minimum amount is $0.01" });
    }

    const payload = {
      amount: amount.toString(),
      currency: "USD",
      type: "DELIVERY_VS_PAYMENT",
      settlementMethod: "OFF_RAMP_MOCK",
      settlementDestination: "murph_escrow",
      description: `Murph Session Payment - $${amount}`,
      metadata: {
        userId: userId.toString(),
        sessionId: sessionId || null,
        teacherId: teacherId || null,
        type: "SESSION_ESCROW",
        platform: "murph"
      }
    };

    console.log("[Escrow] Creating Finternet intent:", payload);

    const response = await finternetAPI.post("/api/v1/payment-intents", payload);
    const intentData = response.data.data || response.data;

    // Store PENDING escrow transaction
    await WalletTransaction.create({
      userId,
      amount: Math.round(amount * 100),
      type: "DEBIT",
      status: "PENDING",
      category: "ESCROW_LOCK",
      description: `Session escrow - $${amount}`,
      paymentIntentId: intentData.id,
      externalRef: intentData.id,
      processed: false,
      metadata: { sessionId, teacherId }
    });

    res.json({
      success: true,
      intentId: intentData.id,
      status: intentData.status || "INITIATED",
      paymentUrl: intentData.paymentUrl,
      amount,
      currency: "USD"
    });

  } catch (error) {
    console.error("[Escrow] Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to create escrow payment" });
  }
};

// ═══════════════════════════════════════════════════════════════════
// ✅ STEP 4 & 5: VERIFY PAYMENT & CREDIT WALLET
// ═══════════════════════════════════════════════════════════════════

/**
 * ⭐ Verify Payment Status (Manual Verification)
 * POST /api/wallet/verify-topup
 * 
 * Called after user returns from Finternet payment page.
 * ⚠️ NEVER credit wallet just because user returned!
 * ⚠️ ALWAYS verify with Finternet first!
 */
const verifyTopup = async (req, res) => {
  try {
    const { intentId } = req.body;
    const userId = req.user._id || req.user.id;

    if (!intentId) {
      return res.status(400).json({ error: "Intent ID required" });
    }

    console.log("[Verify] Checking intent:", intentId);

    // ⭐ STEP 1: Check if already processed (prevent double-credit)
    const existingTx = await WalletTransaction.findOne({
      externalRef: intentId,
      processed: true
    });

    if (existingTx) {
      console.log("[Verify] Already processed:", intentId);
      const user = await User.findById(userId);
      return res.json({
        success: true,
        alreadyProcessed: true,
        message: "Payment already credited",
        newBalance: user.walletBalance / 100
      });
    }

    // ⭐ STEP 2: Verify with Finternet API
    const response = await finternetAPI.get(`/api/v1/payment-intents/${intentId}`);
    const intent = response.data.data || response.data;

    console.log("[Verify] Finternet status:", intent.status);

    // ⭐ STEP 3: Only credit if status = COMPLETED or SETTLED
    if (intent.status === "COMPLETED" || intent.status === "SETTLED") {
      
      const amount = parseFloat(intent.amount);
      const amountCents = Math.round(amount * 100);

      // ⭐ STEP 4: Credit wallet (atomic operation)
      const user = await User.findByIdAndUpdate(
        userId,
        { $inc: { walletBalance: amountCents } },
        { new: true }
      );

      // ⭐ STEP 5: Mark transaction as processed
      await WalletTransaction.findOneAndUpdate(
        { externalRef: intentId },
        {
          status: "SUCCESS",
          processed: true,
          balanceAfter: user.walletBalance,
          processedAt: new Date()
        }
      );

      console.log("[Verify] ✅ Wallet credited:", amount, "New balance:", user.walletBalance / 100);

      return res.json({
        success: true,
        amountCredited: amount,
        newBalance: user.walletBalance / 100,
        message: "Payment verified and wallet credited"
      });
    }

    // Payment not completed yet
    res.json({
      success: false,
      status: intent.status,
      message: `Payment status: ${intent.status}. Wallet not credited.`
    });

  } catch (error) {
    console.error("[Verify] Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to verify payment" });
  }
};

/**
 * Get Payment Intent Status
 * GET /api/wallet/payment-status/:intentId
 */
const getPaymentStatus = async (req, res) => {
  try {
    const { intentId } = req.params;

    const response = await finternetAPI.get(`/api/v1/payment-intents/${intentId}`);
    const intent = response.data.data || response.data;

    res.json({
      success: true,
      intentId: intent.id,
      status: intent.status,
      amount: intent.amount
    });

  } catch (error) {
    res.status(500).json({ error: "Failed to get status" });
  }
};

// ═══════════════════════════════════════════════════════════════════
// 🔔 WEBHOOK: FINTERNET PAYMENT CONFIRMATION (BEST METHOD)
// ═══════════════════════════════════════════════════════════════════

/**
 * ⭐ Finternet Webhook Handler
 * POST /api/wallet/webhook
 * 
 * This is the BEST way to know when payment is complete.
 * Finternet calls this endpoint when payment status changes.
 */
const webhookHandler = async (req, res) => {
  try {
    const event = req.body;
    const signature = req.headers["x-finternet-signature"];

    console.log("[Webhook] Received event:", event.type);

    // ⭐ STEP 1: Verify webhook signature (SECURITY!)
    if (WEBHOOK_SECRET && signature) {
      const expectedSignature = crypto
        .createHmac("sha256", WEBHOOK_SECRET)
        .update(JSON.stringify(req.body))
        .digest("hex");

      if (signature !== expectedSignature) {
        console.error("[Webhook] ❌ Invalid signature");
        return res.status(401).json({ error: "Invalid signature" });
      }
    }

    // ⭐ STEP 2: Handle payment success event
    if (event.type === "payment_intent.succeeded" || 
        event.type === "payment.completed") {
      
      const intentId = event.data?.id || event.intentId;
      
      // Find pending transaction
      const tx = await WalletTransaction.findOne({
        paymentIntentId: intentId,
        processed: false
      });

      if (!tx) {
        console.log("[Webhook] Transaction not found or already processed:", intentId);
        return res.json({ received: true });
      }

      // ⭐ STEP 3: Credit wallet
      const user = await User.findByIdAndUpdate(
        tx.userId,
        { $inc: { walletBalance: tx.amount } },
        { new: true }
      );

      // ⭐ STEP 4: Mark as processed
      tx.status = "SUCCESS";
      tx.processed = true;
      tx.balanceAfter = user.walletBalance;
      tx.processedAt = new Date();
      tx.webhookData = event;
      await tx.save();

      console.log("[Webhook] ✅ Wallet credited via webhook:", tx.amount / 100);
    }

    // ⭐ Handle payment failure
    if (event.type === "payment_intent.failed" || 
        event.type === "payment.failed") {
      
      const intentId = event.data?.id || event.intentId;
      
      await WalletTransaction.findOneAndUpdate(
        { paymentIntentId: intentId },
        { 
          status: "FAILED",
          processed: true,
          failureReason: event.data?.failure_reason || "Payment failed"
        }
      );

      console.log("[Webhook] ❌ Payment failed:", intentId);
    }

    res.json({ received: true });

  } catch (error) {
    console.error("[Webhook] Error:", error);
    res.status(500).json({ error: "Webhook processing failed" });
  }
};

// ═══════════════════════════════════════════════════════════════════
// 🏦 TEACHER WITHDRAWAL (Settlement to Bank)
// ═══════════════════════════════════════════════════════════════════

/**
 * ⭐ Teacher Withdrawal Request
 * POST /api/wallet/withdraw
 * 
 * Flow:
 * 1. Teacher requests withdrawal
 * 2. Debit internal wallet
 * 3. Create Finternet settlement intent
 * 4. Money transferred to teacher's bank
 */
const createWithdrawal = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const { amount, bankAccount } = req.body;

    if (!amount || amount < 10) {
      return res.status(400).json({ error: "Minimum withdrawal is $10" });
    }

    const user = await User.findById(userId);
    const amountCents = Math.round(amount * 100);

    // Check sufficient balance
    if (user.walletBalance < amountCents) {
      return res.status(400).json({ error: "Insufficient balance" });
    }

    // Create Finternet settlement intent
    const payload = {
      amount: amount.toString(),
      currency: "USD",
      type: "SETTLEMENT",
      settlementMethod: "OFF_RAMP_MOCK",
      settlementDestination: bankAccount || "teacher_bank_account",
      description: `Teacher Withdrawal - $${amount}`,
      metadata: {
        userId: userId.toString(),
        type: "WITHDRAWAL",
        platform: "murph"
      }
    };

    const response = await finternetAPI.post("/api/v1/payment-intents", payload);
    const intentData = response.data.data || response.data;

    // Debit wallet immediately (pending settlement)
    await User.findByIdAndUpdate(userId, {
      $inc: { walletBalance: -amountCents }
    });

    // Create transaction record
    await WalletTransaction.create({
      userId,
      amount: amountCents,
      type: "DEBIT",
      status: "PENDING",
      category: "WITHDRAWAL",
      description: `Withdrawal to bank - $${amount}`,
      paymentIntentId: intentData.id,
      externalRef: intentData.id,
      processed: false
    });

    res.json({
      success: true,
      intentId: intentData.id,
      amount,
      message: "Withdrawal initiated. Funds will be transferred within 1-3 business days."
    });

  } catch (error) {
    console.error("[Withdrawal] Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to process withdrawal" });
  }
};

// ═══════════════════════════════════════════════════════════════════
// 🔧 UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Check Finternet API Status
 * GET /api/wallet/finternet-status
 */
const checkFinternetStatus = async (req, res) => {
  try {
    const endpoints = [
      { path: "/api/v1/payment-intents", method: "GET" },
      { path: "/api/v1/health", method: "GET" }
    ];

    const results = [];

    for (const endpoint of endpoints) {
      try {
        const response = await axios({
          method: endpoint.method,
          url: `${FINTERNET_BASE_URL}${endpoint.path}`,
          headers: { "X-API-Key": FINTERNET_KEY },
          timeout: 5000
        });
        results.push({ 
          endpoint: endpoint.path, 
          status: response.status, 
          works: true 
        });
      } catch (err) {
        results.push({ 
          endpoint: endpoint.path, 
          status: err.response?.status || "ERROR",
          works: false,
          error: err.response?.data?.message || err.message
        });
      }
    }

    res.json({
      baseUrl: FINTERNET_BASE_URL,
      apiKeySet: !!FINTERNET_KEY,
      apiKeyPreview: FINTERNET_KEY ? `${FINTERNET_KEY.substring(0, 20)}...` : "NOT SET",
      endpoints: results,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * ⭐ Direct Wallet Credit (For internal use / refunds)
 * POST /api/wallet/direct-credit
 */
const directWalletCredit = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const { amount, reason = "Direct credit" } = req.body;

    if (!amount || amount < 1) {
      return res.status(400).json({ error: "Minimum amount is $1" });
    }

    const amountCents = Math.round(amount * 100);

    const user = await User.findByIdAndUpdate(
      userId,
      { $inc: { walletBalance: amountCents } },
      { new: true }
    );

    await WalletTransaction.create({
      userId,
      amount: amountCents,
      type: "CREDIT",
      status: "SUCCESS",
      category: "ADJUSTMENT",
      description: reason,
      balanceAfter: user.walletBalance,
      processed: true
    });

    res.json({
      success: true,
      message: `$${amount} credited`,
      newBalance: user.walletBalance / 100
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * ⭐ Direct Wallet Debit (For session payments from wallet)
 * POST /api/wallet/debit
 */
const debitWallet = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const { amount, reason = "Session payment", sessionId } = req.body;

    if (!amount || amount < 0.01) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    const amountCents = Math.round(amount * 100);
    const user = await User.findById(userId);

    if (user.walletBalance < amountCents) {
      return res.status(400).json({ 
        error: "Insufficient balance",
        required: amount,
        available: user.walletBalance / 100
      });
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $inc: { walletBalance: -amountCents } },
      { new: true }
    );

    await WalletTransaction.create({
      userId,
      amount: amountCents,
      type: "DEBIT",
      status: "SUCCESS",
      category: "SESSION_PAYMENT",
      description: reason,
      balanceAfter: updatedUser.walletBalance,
      processed: true,
      metadata: { sessionId }
    });

    res.json({
      success: true,
      message: `$${amount} debited`,
      newBalance: updatedUser.walletBalance / 100
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ═══════════════════════════════════════════════════════════════════
// 📤 EXPORTS
// ═══════════════════════════════════════════════════════════════════

module.exports = {
  // Balance & Transactions
  getBalance,
  getTransactions,
  
  // Finternet Payment Intents
  createTopupIntent,
  createEscrowPayment,
  
  // Payment Verification
  verifyTopup,
  getPaymentStatus,
  
  // Webhook
  webhookHandler,
  
  // Withdrawals
  createWithdrawal,
  
  // Direct Operations
  directWalletCredit,
  debitWallet,
  
  // Utility
  checkFinternetStatus
};
