const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth.middleware");
const videoController = require("../controller/video.controllers");

router.post("/start/:videoId", authMiddleware, videoController.startVideo);
router.post("/heartbeat/:usageId", authMiddleware, videoController.heartbeat);
router.post("/end/:usageId", authMiddleware, videoController.endVideo);

module.exports = router;
