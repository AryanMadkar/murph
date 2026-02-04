const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth.middleware");
const {
  getBalance,
  createTopupIntent,
  createEscrowPayment,
  directWalletCredit,
  debitWallet,
  verifyTopup,
  getPaymentStatus,
  getTransactions,
  webhookHandler,
  createWithdrawal,
  checkFinternetStatus,
  simulatePaymentComplete
} = require("../controller/wallet.controllers");

// ⭐ Public - Check API status
router.get("/finternet-status", checkFinternetStatus);

// ⭐ Protected routes - Balance & History
router.get("/balance", authMiddleware, getBalance);
router.get("/transactions", authMiddleware, getTransactions);

// ⭐ Finternet Payment Intents
router.post("/create-topup", authMiddleware, createTopupIntent);        // CONSENTED_PULL - Wallet topup
router.post("/create-escrow", authMiddleware, createEscrowPayment);     // DELIVERY_VS_PAYMENT - Session escrow
router.post("/verify-topup", authMiddleware, verifyTopup);              // Verify payment status
router.get("/payment-status/:intentId", authMiddleware, getPaymentStatus);

// ⭐ Direct Wallet Operations (Internal)
router.post("/direct-credit", authMiddleware, directWalletCredit);      // Credit wallet (refunds/adjustments)
router.post("/debit", authMiddleware, debitWallet);                     // Debit wallet (session payments)

// ⭐ Teacher Withdrawal
router.post("/withdraw", authMiddleware, createWithdrawal);

// ⭐ Webhook (No auth - Finternet calls this)
router.post("/webhook", webhookHandler);

// ⭐ DEV ONLY - Simulate payment completion
router.post("/simulate-complete", authMiddleware, simulatePaymentComplete);

module.exports = router;
