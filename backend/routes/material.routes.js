const express = require("express");
const router = express.Router();
const multer = require("multer");
const {
  uploadMaterial,
  getAllMaterials,
  purchaseMaterial,
  getMaterialAccess,
  getMyPurchases,
  getTeacherMaterials,
} = require("../controller/material.controllers");
const authMiddleware = require("../middleware/auth.middleware");

// Multer storage for memory (to pass buffers to S3 util)
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit for videos
});

// Public / Authenticated discovery
router.get("/", getAllMaterials);

// Authenticated actions
router.post("/upload", authMiddleware, upload.single("file"), uploadMaterial);
router.post("/purchase", authMiddleware, purchaseMaterial);
router.get("/access/:materialId", authMiddleware, getMaterialAccess);
router.get("/my-purchases", authMiddleware, getMyPurchases);
router.get("/teacher", authMiddleware, getTeacherMaterials);

module.exports = router;
