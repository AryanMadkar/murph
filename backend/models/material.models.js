const mongoose = require("mongoose");

const materialSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ["video", "document"],
      required: true,
    },
    // Price in paise (1 USD = 100)
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    url: {
      type: String,
      required: true,
    },
    thumbnailUrl: {
      type: String,
      default: null,
    },
    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    category: {
      type: String,
      required: true,
      index: true,
    },
    tags: {
      type: [String],
      default: [],
    },
    // Semantic embedding for AI recommendations (Optional, can be generated on the fly or cached)
    contentEmbedding: {
      type: [Number],
      default: [],
    },
    purchaseCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

// Virtual for price in dollars
materialSchema.virtual("priceInDollars").get(function () {
  return this.price / 100;
});

// Include virtuals in JSON
materialSchema.set("toJSON", { virtuals: true });
materialSchema.set("toObject", { virtuals: true });

const Material = mongoose.model("Material", materialSchema);

module.exports = Material;
