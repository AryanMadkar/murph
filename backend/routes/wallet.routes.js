const express = require("express");
const router = express.Router();
const {
  getBalance,
  createTopupIntent,
  verifyTopup,
  getPaymentStatus,
  getTransactions,
  webhookHandler,
} = require("../controller/wallet.controllers");

// Auth middleware
const authMiddleware = require("../middleware/auth.middleware");

/**
 * Wallet Routes — Finternet Integration
 * 
 * Flow:
 * 1. Student clicks "Add $10"
 * 2. Frontend calls POST /api/wallet/create-topup
 * 3. Backend creates Finternet Payment Intent, returns intentId + paymentUrl
 * 4. Frontend redirects to paymentUrl or opens modal
 * 5. Student completes payment
 * 6. Frontend polls GET /api/wallet/payment-status/:intentId OR calls POST /api/wallet/verify-topup
 * 7. Backend verifies status & credits wallet
 */

// Get wallet balance
router.get("/balance", authMiddleware, getBalance);

// ⭐ STEP 3 - Create payment intent for top-up
router.post("/create-topup", authMiddleware, createTopupIntent);

// ⭐ STEP 4 - Verify payment and credit wallet
router.post("/verify-topup", authMiddleware, verifyTopup);

// Poll payment status
router.get("/payment-status/:intentId", authMiddleware, getPaymentStatus);

// Get transaction history
router.get("/transactions", authMiddleware, getTransactions);

// Finternet webhook (no auth - verified by signature)
router.post("/webhook", webhookHandler);

module.exports = router;
