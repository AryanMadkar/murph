const express = require("express");
const router = express.Router();
const {
  generateLesson,
  getLessonStatus,
  getLesson,
  getUserLessons,
  getCachedLesson,
} = require("../controller/virtualTeacher.controller");
const authMiddleware = require("../middleware/auth.middleware");

// Generate a new virtual teacher lesson
router.post("/generate", authMiddleware, generateLesson);

// Check generation status
router.get("/status/:lessonId", authMiddleware, getLessonStatus);

// Get a completed lesson
router.get("/lesson/:lessonId", authMiddleware, getLesson);

// Get all lessons for current user
router.get("/my-lessons", authMiddleware, getUserLessons);

// Check if a lesson is already cached for a topic
router.get("/cached/:topic", authMiddleware, getCachedLesson);

module.exports = router;
