const express = require("express");
const router = express.Router();
const {
  createPaymentIntent,
  verifyPayment,
  getWalletBalance,
} = require("../controller/payment.controllers");

router.post("/create-intent", createPaymentIntent);
router.post("/verify", verifyPayment);
router.get("/balance/:userId", getWalletBalance);

module.exports = router;
