const mongoose = require("mongoose");

const heartbeatSchema = new mongoose.Schema({
  timestamp: { type: Date, required: true },
  status: { type: String, enum: ["ACTIVE", "PAUSED", "DISCONNECTED"], default: "ACTIVE" }
});

const sessionUsageSchema = new mongoose.Schema({
  meetingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Meeting",
    required: true,
    index: true
  },
  
  // Timing
  joinTime: { type: Date },
  leaveTime: { type: Date },
  actualDuration: { type: Number, default: 0 }, // in seconds
  billableDuration: { type: Number, default: 0 }, // in seconds (excludes pauses)
  
  // Real-time tracking
  heartbeats: [heartbeatSchema],
  lastHeartbeat: { type: Date },
  
  // Connection tracking
  disconnections: [{
    disconnectTime: Date,
    reconnectTime: Date,
    duration: Number // seconds
  }],
  totalDisconnectTime: { type: Number, default: 0 }, // seconds
  
  // Billing
  billingTier: {
    type: String,
    enum: ["STANDARD", "DISCOUNTED", "PREMIUM"],
    default: "STANDARD"
  },
  
  // Quality metrics
  studentRating: { type: Number, min: 1, max: 5 },
  teacherRating: { type: Number, min: 1, max: 5 },
  qualityScore: { type: Number, default: 100 }, // 0-100
  
  // Status
  status: {
    type: String,
    enum: ["ACTIVE", "PAUSED", "COMPLETED", "CANCELLED", "DISPUTED"],
    default: "ACTIVE"
  }
  
}, { timestamps: true });

// Calculate billable time excluding disconnections
sessionUsageSchema.methods.calculateBillableTime = function() {
  if (!this.joinTime) return 0;
  
  const endTime = this.leaveTime || new Date();
  const totalSeconds = Math.floor((endTime - this.joinTime) / 1000);
  
  // Subtract disconnection time (grace period: first 30s free)
  const billableDisconnect = Math.max(0, this.totalDisconnectTime - 30);
  
  return Math.max(0, totalSeconds - billableDisconnect);
};

// Get billing breakdown
sessionUsageSchema.methods.getBillingBreakdown = function(pricePerMinute) {
  const billableSeconds = this.billableDuration || this.calculateBillableTime();
  const billableMinutes = Math.ceil(billableSeconds / 60);
  
  // Tiered pricing
  let breakdown = {
    totalMinutes: billableMinutes,
    tiers: [],
    subtotal: 0,
    qualityAdjustment: 0,
    finalAmount: 0
  };
  
  // Tier 1: First 10 minutes at 80% rate (discount for starting)
  const tier1Minutes = Math.min(billableMinutes, 10);
  const tier1Rate = pricePerMinute * 0.8;
  const tier1Amount = tier1Minutes * tier1Rate;
  
  if (tier1Minutes > 0) {
    breakdown.tiers.push({
      name: "First 10 minutes (20% off)",
      minutes: tier1Minutes,
      rate: tier1Rate,
      amount: tier1Amount
    });
  }
  
  // Tier 2: 11-30 minutes at standard rate
  const tier2Minutes = Math.min(Math.max(0, billableMinutes - 10), 20);
  const tier2Amount = tier2Minutes * pricePerMinute;
  
  if (tier2Minutes > 0) {
    breakdown.tiers.push({
      name: "Standard rate (11-30 min)",
      minutes: tier2Minutes,
      rate: pricePerMinute,
      amount: tier2Amount
    });
  }
  
  // Tier 3: 31+ minutes at 90% rate (loyalty discount)
  const tier3Minutes = Math.max(0, billableMinutes - 30);
  const tier3Rate = pricePerMinute * 0.9;
  const tier3Amount = tier3Minutes * tier3Rate;
  
  if (tier3Minutes > 0) {
    breakdown.tiers.push({
      name: "Extended session (10% off)",
      minutes: tier3Minutes,
      rate: tier3Rate,
      amount: tier3Amount
    });
  }
  
  breakdown.subtotal = tier1Amount + tier2Amount + tier3Amount;
  
  // Quality adjustment based on ratings
  if (this.studentRating) {
    if (this.studentRating >= 5) {
      breakdown.qualityAdjustment = breakdown.subtotal * 0.05; // 5% bonus
    } else if (this.studentRating <= 2) {
      breakdown.qualityAdjustment = breakdown.subtotal * -0.1; // 10% refund
    }
  }
  
  breakdown.finalAmount = Math.max(0, breakdown.subtotal + breakdown.qualityAdjustment);
  
  return breakdown;
};

module.exports = mongoose.model("SessionUsage", sessionUsageSchema);
