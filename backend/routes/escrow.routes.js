const express = require("express");
const router = express.Router();
const {
  createSessionEscrow,
  releaseEscrow,
  refundEscrow,
  getEscrowStatus,
} = require("../controller/escrow.controllers");
const authMiddleware = require("../middleware/auth.middleware");

/**
 * Escrow Routes — Finternet DELIVERY_VS_PAYMENT
 * 
 * Flow:
 * 1. Student books session → POST /api/escrow/create
 * 2. Money locked in Finternet escrow
 * 3. Session completes → POST /api/escrow/release (teacher gets paid)
 * 4. OR Session cancelled → POST /api/escrow/refund (student gets refund)
 */

// Create escrow for session
router.post("/create", authMiddleware, createSessionEscrow);

// Release escrow to teacher (session completed)
router.post("/release", authMiddleware, releaseEscrow);

// Refund escrow to student (session cancelled)
router.post("/refund", authMiddleware, refundEscrow);

// Get escrow status
router.get("/status/:intentId", authMiddleware, getEscrowStatus);

module.exports = router;
