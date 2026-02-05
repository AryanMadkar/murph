const mongoose = require("mongoose");

const lessonSchema = new mongoose.Schema(
  {
    topic: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    script: {
      type: String,
      default: "",
    },
    keyPoints: [
      {
        type: String,
      },
    ],
    audioUrl: {
      type: String,
      default: "",
    },
    videoUrl: {
      type: String,
      default: "",
    },
    thumbnailUrl: {
      type: String,
      default: "",
    },
    duration: {
      type: Number, // in seconds
      default: 0,
    },
    status: {
      type: String,
      enum: [
        "pending",
        "generating_script",
        "generating_audio",
        "generating_video",
        "completed",
        "failed",
      ],
      default: "pending",
    },
    errorMessage: {
      type: String,
      default: "",
    },
    // Job tracking for D-ID
    externalJobId: {
      type: String,
      default: "",
    },
    // Avatar settings
    avatarId: {
      type: String,
      default: "amy-jcwCkr1grs", // Default D-ID avatar
    },
    voiceId: {
      type: String,
      default: "21m00Tcm4TlvDq8ikWAM", // ElevenLabs Rachel voice
    },
    language: {
      type: String,
      default: "en",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true },
);

// Index for finding cached lessons
lessonSchema.index({ topic: 1, status: 1 });
lessonSchema.index({ createdBy: 1, createdAt: -1 });

module.exports = mongoose.model("Lesson", lessonSchema);
