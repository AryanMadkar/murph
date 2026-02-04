const express = require("express");
const router = express.Router();
const {
  getRecommendedContent,
} = require("../controller/recommendation.controllers");
const authMiddleware = require("../middleware/auth.middleware");

router.get("/", authMiddleware, getRecommendedContent);

module.exports = router;
