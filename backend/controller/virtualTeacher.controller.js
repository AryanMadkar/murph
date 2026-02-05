const Lesson = require("../models/lesson.models");
const axios = require("axios");

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8001";

/**
 * Generate a new virtual teacher lesson
 * POST /api/virtual-teacher/generate
 */
const generateLesson = async (req, res) => {
  try {
    const { topic, avatarId, voiceId, language } = req.body;
    const userId = req.user._id || req.user.id;

    if (!topic || topic.trim().length < 3) {
      return res.status(400).json({
        success: false,
        error: "Topic must be at least 3 characters long",
      });
    }

    // Check for cached lesson with same topic (completed within last 7 days)
    const cachedLesson = await Lesson.findOne({
      topic: { $regex: new RegExp(`^${topic.trim()}$`, "i") },
      status: "completed",
      createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    });

    if (cachedLesson) {
      return res.json({
        success: true,
        lesson: cachedLesson,
        cached: true,
        message: "Found cached lesson for this topic!",
      });
    }

    // Create new lesson record
    const lesson = new Lesson({
      topic: topic.trim(),
      status: "pending",
      avatarId: avatarId || "amy-jcwCkr1grs",
      voiceId: voiceId || "21m00Tcm4TlvDq8ikWAM",
      language: language || "en",
      createdBy: userId,
    });

    await lesson.save();

    // Trigger async generation via Python AI service
    // Don't await - let it run in background
    triggerGeneration(lesson._id.toString()).catch((err) => {
      console.error("Background generation error:", err);
    });

    res.json({
      success: true,
      lesson: {
        _id: lesson._id,
        topic: lesson.topic,
        status: lesson.status,
      },
      message: "Lesson generation started! This may take 2-3 minutes.",
    });
  } catch (error) {
    console.error("Generate lesson error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to start lesson generation",
    });
  }
};

/**
 * Trigger the Python AI service to generate the lesson
 */
const triggerGeneration = async (lessonId) => {
  try {
    const lesson = await Lesson.findById(lessonId);
    if (!lesson) return;

    // Update status to generating
    lesson.status = "generating_script";
    await lesson.save();

    // Call Python AI service
    const response = await axios.post(
      `${AI_SERVICE_URL}/api/virtual-teacher/generate`,
      {
        lessonId: lessonId,
        topic: lesson.topic,
        avatarId: lesson.avatarId,
        voiceId: lesson.voiceId,
        language: lesson.language,
      },
      { timeout: 300000 }, // 5 minute timeout
    );

    if (response.data.success) {
      // Update lesson with generated content
      lesson.script = response.data.script || "";
      lesson.keyPoints = response.data.keyPoints || [];
      lesson.audioUrl = response.data.audioUrl || "";
      lesson.videoUrl = response.data.videoUrl || "";
      lesson.thumbnailUrl = response.data.thumbnailUrl || "";
      lesson.duration = response.data.duration || 0;
      lesson.externalJobId = response.data.jobId || "";
      lesson.status = "completed";
      await lesson.save();
    } else {
      lesson.status = "failed";
      lesson.errorMessage = response.data.error || "Generation failed";
      await lesson.save();
    }
  } catch (error) {
    console.error("Trigger generation error:", error);
    const lesson = await Lesson.findById(lessonId);
    if (lesson) {
      lesson.status = "failed";
      lesson.errorMessage = error.message || "Generation service unavailable";
      await lesson.save();
    }
  }
};

/**
 * Get lesson generation status
 * GET /api/virtual-teacher/status/:lessonId
 */
const getLessonStatus = async (req, res) => {
  try {
    const { lessonId } = req.params;
    const userId = req.user._id || req.user.id;

    const lesson = await Lesson.findOne({
      _id: lessonId,
      createdBy: userId,
    });

    if (!lesson) {
      return res.status(404).json({
        success: false,
        error: "Lesson not found",
      });
    }

    res.json({
      success: true,
      status: lesson.status,
      lesson: {
        _id: lesson._id,
        topic: lesson.topic,
        status: lesson.status,
        videoUrl: lesson.status === "completed" ? lesson.videoUrl : null,
        errorMessage: lesson.errorMessage,
      },
    });
  } catch (error) {
    console.error("Get status error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * Get a completed lesson
 * GET /api/virtual-teacher/lesson/:lessonId
 */
const getLesson = async (req, res) => {
  try {
    const { lessonId } = req.params;
    const userId = req.user._id || req.user.id;

    const lesson = await Lesson.findOne({
      _id: lessonId,
      createdBy: userId,
    });

    if (!lesson) {
      return res.status(404).json({
        success: false,
        error: "Lesson not found",
      });
    }

    res.json({
      success: true,
      lesson,
    });
  } catch (error) {
    console.error("Get lesson error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * Get all lessons for current user
 * GET /api/virtual-teacher/my-lessons
 */
const getUserLessons = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;

    const lessons = await Lesson.find({ createdBy: userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .select("-script"); // Exclude large script field for list view

    res.json({
      success: true,
      lessons,
    });
  } catch (error) {
    console.error("Get user lessons error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * Check for cached lesson by topic
 * GET /api/virtual-teacher/cached/:topic
 */
const getCachedLesson = async (req, res) => {
  try {
    const { topic } = req.params;

    const cachedLesson = await Lesson.findOne({
      topic: { $regex: new RegExp(`^${topic.trim()}$`, "i") },
      status: "completed",
      createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    });

    res.json({
      success: true,
      cached: !!cachedLesson,
      lesson: cachedLesson || null,
    });
  } catch (error) {
    console.error("Get cached lesson error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

module.exports = {
  generateLesson,
  getLessonStatus,
  getLesson,
  getUserLessons,
  getCachedLesson,
};
