const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    email: { type: String, unique: true, required: true },
    role: { type: String, enum: ["teacher", "student"], required: true },

    // Store multiple embeddings for accuracy
    embeddings: {
      type: [[Number]],
      required: true,
    },

    // Legacy field for data migration
    embedding: {
      type: [Number],
      required: false,
    },

    walletBalance: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("User", userSchema);
