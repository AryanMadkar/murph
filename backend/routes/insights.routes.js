const express = require("express");
const router = express.Router();
const { generateTeachingTips } = require("../controller/insights.controllers");

router.post("/generate", generateTeachingTips);

module.exports = router;
