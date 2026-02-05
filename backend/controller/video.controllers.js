const VideoUsage = require("../models/videoUsage.models");
const Material = require("../models/material.models");
const User = require("../models/user.models");
const WalletTransaction = require("../models/walletTransaction.models");

// Pricing config (same as session)
const PRICING = {
  pricePerMinute: 8.33, // $0.0833/min in cents (for $5/60min)
  maxDuration: 60, // minutes
  platformFeePercent: 10
};

// Helper: Calculate tiered billing
function getBillingBreakdown(billableMinutes) {
  let breakdown = {
    totalMinutes: billableMinutes,
    tiers: [],
    subtotal: 0,
    finalAmount: 0
  };
  // Tier 1: First 10 min at 20% off
  const tier1Minutes = Math.min(billableMinutes, 10);
  const tier1Rate = PRICING.pricePerMinute * 0.8;
  const tier1Amount = tier1Minutes * tier1Rate;
  if (tier1Minutes > 0) breakdown.tiers.push({ name: "First 10 min (20% off)", minutes: tier1Minutes, rate: tier1Rate, amount: tier1Amount });
  // Tier 2: 11-30 min at standard
  const tier2Minutes = Math.min(Math.max(0, billableMinutes - 10), 20);
  const tier2Amount = tier2Minutes * PRICING.pricePerMinute;
  if (tier2Minutes > 0) breakdown.tiers.push({ name: "Standard (11-30 min)", minutes: tier2Minutes, rate: PRICING.pricePerMinute, amount: tier2Amount });
  // Tier 3: 31+ min at 10% off
  const tier3Minutes = Math.max(0, billableMinutes - 30);
  const tier3Rate = PRICING.pricePerMinute * 0.9;
  const tier3Amount = tier3Minutes * tier3Rate;
  if (tier3Minutes > 0) breakdown.tiers.push({ name: "31+ min (10% off)", minutes: tier3Minutes, rate: tier3Rate, amount: tier3Amount });
  breakdown.subtotal = tier1Amount + tier2Amount + tier3Amount;
  breakdown.finalAmount = Math.max(0, breakdown.subtotal);
  return breakdown;
}

// 1. Start video: lock escrow
exports.startVideo = async (req, res) => {
  try {
    const { videoId } = req.params;
    const userId = req.user._id;
    const video = await Material.findById(videoId);
    if (!video) return res.status(404).json({ error: "Video not found" });
    // Lock max amount ($5)
    const escrowAmount = 500; // cents
    const user = await User.findById(userId);
    if (user.walletBalance < escrowAmount) return res.status(400).json({ error: "Insufficient balance" });
    user.walletBalance -= escrowAmount;
    await user.save();
    await WalletTransaction.create({ userId, amount: escrowAmount, type: "DEBIT", status: "SUCCESS", category: "VIDEO_ESCROW_LOCK", description: `Escrow locked for video`, balanceAfter: user.walletBalance, materialId: videoId });
    // Create usage record
    const usage = await VideoUsage.create({ userId, videoId, startTime: new Date(), status: "ACTIVE" });
    res.json({ success: true, usageId: usage._id, escrowLocked: escrowAmount / 100 });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// 2. Heartbeat/progress: update watch time
exports.heartbeat = async (req, res) => {
  try {
    const { usageId } = req.params;
    const { secondsWatched } = req.body;
    const usage = await VideoUsage.findById(usageId);
    if (!usage || usage.status !== "ACTIVE") return res.status(404).json({ error: "No active usage" });
    usage.watchSeconds += secondsWatched;
    await usage.save();
    res.json({ success: true, totalSeconds: usage.watchSeconds });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// 3. End video: bill and refund
exports.endVideo = async (req, res) => {
  try {
    const { usageId } = req.params;
    const usage = await VideoUsage.findById(usageId);
    if (!usage || usage.status !== "ACTIVE") return res.status(404).json({ error: "No active usage" });
    usage.endTime = new Date();
    usage.status = "COMPLETED";
    await usage.save();
    // Calculate billable minutes
    const billableMinutes = Math.ceil(usage.watchSeconds / 60);
    const billing = getBillingBreakdown(billableMinutes);
    const finalCharge = Math.round(billing.finalAmount);
    const refund = 500 - finalCharge;
    // Refund unused escrow
    const user = await User.findById(usage.userId);
    if (refund > 0) {
      user.walletBalance += refund;
      await user.save();
      await WalletTransaction.create({ userId: user._id, amount: refund, type: "CREDIT", status: "SUCCESS", category: "VIDEO_ESCROW_REFUND", description: `Unused video escrow refund`, balanceAfter: user.walletBalance, materialId: usage.videoId });
    }
    // Pay teacher
    const video = await Material.findById(usage.videoId);
    const teacher = await User.findById(video.teacherId);
    const platformFee = Math.round(finalCharge * PRICING.platformFeePercent / 100);
    const teacherEarning = finalCharge - platformFee;
    teacher.walletBalance += teacherEarning;
    await teacher.save();
    await WalletTransaction.create({ userId: teacher._id, amount: teacherEarning, type: "CREDIT", status: "SUCCESS", category: "VIDEO_PAYOUT", description: `Video payout`, balanceAfter: teacher.walletBalance, materialId: usage.videoId });
    res.json({ success: true, bill: { minutes: billableMinutes, billing, finalCharge: finalCharge / 100, refund: refund / 100, teacherEarning: teacherEarning / 100 } });
  } catch (e) { res.status(500).json({ error: e.message }); }
};
