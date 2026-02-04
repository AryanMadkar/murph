const User = require("../models/user.models");
const WalletTransaction = require("../models/walletTransaction.models");
const axios = require("axios");
const crypto = require("crypto");

// Finternet API Config
const FINTERNET_API_URL = process.env.FINTERNET_API_URL || "https://api.fmm.finternetlab.io/api/v1";
const FINTERNET_KEY = process.env.FINTERNET_KEY || process.env.FINTERNET_API_KEY;

/**
 * Get wallet balance
 * GET /api/wallet/balance
 */
const getBalance = async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      success: true,
      data: {
        balanceInCents: user.walletBalance,
        balanceInDollars: user.walletBalance / 100,
        currency: "USD",
      },
    });
  } catch (error) {
    console.error("Get balance error:", error);
    res.status(500).json({ error: "Failed to get balance" });
  }
};

/**
 * ⭐ STEP 3 — Create Payment Intent for Wallet Topup
 * POST /api/wallet/create-topup
 * Body: { amount: 10 } // amount in dollars
 */
const createTopupIntent = async (req, res) => {
  try {
    const userId = req.user._id;
    const { amount } = req.body;

    // Validate amount
    if (!amount || amount < 0.01) {
      return res.status(400).json({ error: "Minimum amount is $0.01" });
    }

    if (amount > 10000) {
      return res.status(400).json({ error: "Maximum amount is $10,000" });
    }

    // Convert to cents for storage
    const amountInCents = Math.round(amount * 100);

    // Create Finternet Payment Intent
    const response = await axios.post(
      `${FINTERNET_API_URL}/payment-intents`,
      {
        amount: amount.toString(),
        currency: "USD",
        type: "CONSENTED_PULL",
        settlementMethod: "OFF_RAMP_MOCK",
        settlementDestination: "murph_platform_wallet",
        description: `Wallet Topup - $${amount}`,
        metadata: {
          userId: userId.toString(),
          type: "WALLET_TOPUP",
          platform: "murph"
        }
      },
      {
        headers: {
          "X-API-Key": FINTERNET_KEY,
          "Content-Type": "application/json"
        }
      }
    );

    const intentData = response.data.data || response.data;

    // Create pending transaction
    await WalletTransaction.create({
      userId,
      amount: amountInCents,
      type: "CREDIT",
      status: "PENDING",
      category: "TOPUP",
      description: `Wallet top-up of $${amount}`,
      paymentIntentId: intentData.id,
      externalRef: intentData.id,
      metadata: {
        finternetIntentId: intentData.id,
        paymentUrl: intentData.paymentUrl,
      },
    });

    res.json({
      success: true,
      data: {
        intentId: intentData.id,
        status: intentData.status,
        paymentUrl: intentData.paymentUrl,
        amount: amount,
        currency: "USD",
      },
    });
  } catch (error) {
    console.error("Create topup intent error:", error.response?.data || error.message);
    res.status(500).json({ 
      error: "Failed to create payment intent",
      details: error.response?.data || error.message
    });
  }
};

/**
 * ⭐ STEP 5 — Verify Payment Status & Credit Wallet
 * POST /api/wallet/verify-topup
 * Body: { intentId: "intent_xxx" }
 */
const verifyTopup = async (req, res) => {
  try {
    const { intentId } = req.body;

    if (!intentId) {
      return res.status(400).json({ error: "Intent ID required" });
    }

    // Get payment status from Finternet
    const response = await axios.get(
      `${FINTERNET_API_URL}/payment-intents/${intentId}`,
      {
        headers: {
          "X-API-Key": FINTERNET_KEY,
        }
      }
    );

    const intent = response.data.data || response.data;

    // Only credit if COMPLETED
    if (intent.status === "COMPLETED") {
      const userId = intent.metadata.userId;
      const amount = Number(intent.amount);

      // Check if already processed (idempotency)
      const existingTx = await WalletTransaction.findOne({
        externalRef: intentId,
        status: "SUCCESS",
      });

      if (existingTx) {
        const user = await User.findById(userId);
        return res.json({
          success: true,
          message: "Payment already processed",
          data: {
            amountCredited: amount,
            newBalance: user.walletBalance / 100,
          },
        });
      }

      // Credit wallet using $inc for atomicity
      const user = await User.findByIdAndUpdate(
        userId,
        { $inc: { walletBalance: Math.round(amount * 100) } }, // Convert to cents
        { new: true }
      );

      // Update or create transaction record
      await WalletTransaction.findOneAndUpdate(
        { externalRef: intentId },
        {
          userId,
          amount: Math.round(amount * 100),
          type: "CREDIT",
          status: "SUCCESS",
          category: "TOPUP",
          description: `Wallet top-up of $${amount}`,
          externalRef: intentId,
          balanceAfter: user.walletBalance,
          metadata: {
            finternetIntentId: intentId,
            finternetStatus: intent.status,
            verifiedAt: new Date(),
          },
        },
        { upsert: true, new: true }
      );

      return res.json({
        success: true,
        message: "Payment verified and wallet credited",
        data: {
          amountCredited: amount,
          newBalance: user.walletBalance / 100,
        },
      });
    }

    // Payment not completed yet
    res.json({
      success: false,
      status: intent.status,
      message: intent.status === "FAILED" ? "Payment failed" : "Payment still processing",
    });
  } catch (error) {
    console.error("Verify topup error:", error.response?.data || error.message);
    res.status(500).json({ 
      error: "Failed to verify payment",
      details: error.response?.data || error.message
    });
  }
};

/**
 * Get payment status (polling endpoint)
 * GET /api/wallet/payment-status/:intentId
 */
const getPaymentStatus = async (req, res) => {
  try {
    const { intentId } = req.params;

    const response = await axios.get(
      `${FINTERNET_API_URL}/payment-intents/${intentId}`,
      {
        headers: {
          "X-API-Key": FINTERNET_KEY,
        }
      }
    );

    const intentData = response.data.data || response.data;

    res.json({
      success: true,
      data: {
        intentId: intentData.id,
        status: intentData.status,
        amount: intentData.amount,
        currency: intentData.currency,
      },
    });
  } catch (error) {
    console.error("Get payment status error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to get payment status" });
  }
};

/**
 * Get transaction history
 * GET /api/wallet/transactions?limit=20&skip=0&type=CREDIT
 */
const getTransactions = async (req, res) => {
  try {
    const userId = req.user._id;
    const { limit = 20, skip = 0, type, category } = req.query;

    const transactions = await WalletTransaction.getHistory(userId, {
      limit: parseInt(limit),
      skip: parseInt(skip),
      type,
      category,
    });

    const summary = await WalletTransaction.getSummary(userId);

    res.json({
      success: true,
      data: {
        transactions,
        summary: {
          totalCredits: summary.credits / 100,
          totalDebits: summary.debits / 100,
          netBalance: summary.net / 100,
        },
      },
    });
  } catch (error) {
    console.error("Get transactions error:", error);
    res.status(500).json({ error: "Failed to get transactions" });
  }
};

/**
 * Finternet Webhook Handler
 * POST /api/wallet/webhook
 */
const webhookHandler = async (req, res) => {
  try {
    const webhookSecret = process.env.FINTERNET_WEBHOOK_SECRET;
    
    // Verify webhook signature if secret is set
    if (webhookSecret) {
      const signature = req.headers["x-webhook-signature"];
      const body = JSON.stringify(req.body);
      
      const expectedSignature = crypto
        .createHmac("sha256", webhookSecret)
        .update(body)
        .digest("hex");

      if (signature !== expectedSignature) {
        console.error("Webhook signature mismatch");
        return res.status(400).json({ error: "Invalid signature" });
      }
    }

    const event = req.body;
    const eventType = event.type;
    const eventData = event.data || {};

    console.log(`[Webhook] Received: ${eventType}`);

    switch (eventType) {
      case "payment_intent.succeeded":
      case "payment_intent.settled":
        // Payment successful - credit wallet
        const intentId = eventData.id;
        
        const pendingTx = await WalletTransaction.findOne({
          paymentIntentId: intentId,
          status: "PENDING",
        });

        if (pendingTx) {
          const user = await User.findById(pendingTx.userId);
          await user.addFunds(pendingTx.amount);
          
          pendingTx.status = "SUCCESS";
          pendingTx.balanceAfter = user.walletBalance;
          pendingTx.metadata = {
            ...pendingTx.metadata,
            webhookVerified: true,
            verifiedAt: new Date(),
          };
          await pendingTx.save();
          
          console.log(`[Webhook] Credited ${pendingTx.amount} cents to user ${pendingTx.userId}`);
        }
        break;

      case "payment_intent.failed":
        // Payment failed
        const failedIntentId = eventData.id;
        await WalletTransaction.findOneAndUpdate(
          { paymentIntentId: failedIntentId, status: "PENDING" },
          { 
            status: "FAILED",
            metadata: { 
              reason: eventData.failureReason || "Payment failed",
              webhookVerified: true
            }
          }
        );
        break;
    }

    res.json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error);
    res.status(500).json({ error: "Webhook processing failed" });
  }
};

module.exports = {
  getBalance,
  createTopupIntent,
  verifyTopup,
  getPaymentStatus,
  getTransactions,
  webhookHandler,
};
