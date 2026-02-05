const mongoose = require("mongoose");

const videoUsageSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  videoId: { type: mongoose.Schema.Types.ObjectId, ref: "Material", required: true },
  startTime: { type: Date, required: true },
  endTime: { type: Date },
  watchSeconds: { type: Number, default: 0 },
  status: { type: String, enum: ["ACTIVE", "COMPLETED"], default: "ACTIVE" }
}, { timestamps: true });

module.exports = mongoose.model("VideoUsage", videoUsageSchema);
