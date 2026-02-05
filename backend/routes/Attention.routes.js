const express = require("express");
const router = express.Router();
const {
  startAttentionSession,
  recordAttentionData,
  endAttentionSession,
  getAttentionSession,
  getLiveAttentionStatus,
  getStudentAttentionHistory,
} = require("../controller/Attention.controllers");

router.post("/start", startAttentionSession);
router.post("/record", recordAttentionData);
router.post("/end", endAttentionSession);
router.get("/session/:sessionId", getAttentionSession);
router.get("/live/:roomId", getLiveAttentionStatus);

module.exports = router;
