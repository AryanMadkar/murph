const Material = require("../models/material.models");
const User = require("../models/user.models");
const WalletTransaction = require("../models/walletTransaction.models");
const { uploadToS3, getSignedDownloadUrl } = require("../utils/s3");

const uploadMaterial = async (req, res) => {
  try {
    const { title, description, type, price, category, tags } = req.body;
    const teacherId = req.user._id;

    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: "No file uploaded" });
    }

    // Upload to S3
    const s3Key = await uploadToS3(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      type === "video" ? "videos" : "documents",
    );

    const material = await Material.create({
      title,
      description,
      type,
      price: parseInt(price), // ensure it's in paise
      category,
      tags: tags ? tags.split(",").map((t) => t.trim()) : [],
      url: s3Key,
      teacherId,
    });

    res.status(201).json({
      success: true,
      message: "Material uploaded successfully",
      material,
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const getAllMaterials = async (req, res) => {
  try {
    const { category, type, minPrice, maxPrice, search } = req.query;
    let query = {};

    if (category) query.category = category;
    if (type) query.type = type;
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = parseInt(minPrice);
      if (maxPrice) query.price.$lte = parseInt(maxPrice);
    }
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    const materials = await Material.find(query).populate(
      "teacherId",
      "name email specialization",
    );

    // Generate signed URLs for previews if needed (usually just for owned items, but maybe for trial videos)
    res.json({ success: true, materials });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const purchaseMaterial = async (req, res) => {
  try {
    const { materialId } = req.body;
    const studentId = req.user._id;

    const material = await Material.findById(materialId);
    if (!material) {
      return res
        .status(404)
        .json({ success: false, message: "Material not found" });
    }

    // 0. Safety: Prevent self-purchase
    if (material.teacherId.toString() === studentId.toString()) {
      return res
        .status(400)
        .json({
          success: false,
          message: "You cannot purchase your own material",
        });
    }

    // 1. Check for duplicate purchase
    const existingPurchase = await WalletTransaction.findOne({
      userId: studentId,
      materialId,
      category: "MATERIAL_PURCHASE",
      status: "SUCCESS",
    });
    if (existingPurchase) {
      return res
        .status(400)
        .json({
          success: false,
          message: "You have already purchased this material",
        });
    }

    const student = await User.findById(studentId);
    if (student.walletBalance < material.price) {
      return res
        .status(400)
        .json({ success: false, message: "Insufficient balance" });
    }

    // 2. Process Transaction (Manual atomicity since some local DBs aren't replica sets)
    // In production, use mongoose.startSession()
    const teacher = await User.findById(material.teacherId);
    const platformFee = Math.floor(material.price * 0.1);
    const teacherEarning = material.price - platformFee;

    // Deduct student funds
    await student.deductFunds(material.price);

    try {
      // Create student transaction record
      await WalletTransaction.create({
        userId: studentId,
        amount: material.price,
        type: "DEBIT",
        status: "SUCCESS",
        category: "MATERIAL_PURCHASE",
        description: `Purchased material: ${material.title}`,
        materialId: material._id,
        balanceAfter: student.walletBalance,
      });

      // Add teacher funds
      await teacher.addFunds(teacherEarning);

      // Create teacher transaction record
      await WalletTransaction.create({
        userId: teacher._id,
        amount: teacherEarning,
        type: "CREDIT",
        status: "SUCCESS",
        category: "MATERIAL_EARNING",
        description: `Earned from sale: ${material.title}`,
        materialId: material._id,
        balanceAfter: teacher.walletBalance,
      });

      material.purchaseCount += 1;
      await material.save();

      res.json({ success: true, message: "Purchase successful" });
    } catch (innerError) {
      // Fail-safe: Refund student if subsequent steps fail
      console.error(
        "Critical failure during purchase processing, initiating refund:",
        innerError,
      );
      await student.addFunds(material.price);
      throw new Error("Transaction failed and was rolled back.");
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getMaterialAccess = async (req, res) => {
  try {
    const { materialId } = req.params;
    const userId = req.user._id;

    // Check if user is the teacher who uploaded or a student who purchased
    const material = await Material.findById(materialId);

    let hasAccess = false;
    if (material.teacherId.toString() === userId.toString()) {
      hasAccess = true;
    } else {
      const purchase = await WalletTransaction.findOne({
        userId,
        materialId,
        category: "MATERIAL_PURCHASE",
        status: "SUCCESS",
      });
      if (purchase) hasAccess = true;
    }

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Please purchase the material first.",
      });
    }

    const signedUrl = await getSignedDownloadUrl(material.url);
    res.json({ success: true, url: signedUrl });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getMyPurchases = async (req, res) => {
  try {
    const userId = req.user._id;
    const purchases = await WalletTransaction.find({
      userId,
      category: "MATERIAL_PURCHASE",
      status: "SUCCESS",
    }).populate("materialId");

    const materials = purchases
      .map((p) => p.materialId)
      .filter((m) => m != null);
    res.json({ success: true, materials });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getTeacherMaterials = async (req, res) => {
  try {
    const teacherId = req.user._id;
    const materials = await Material.find({ teacherId });
    res.json({ success: true, materials });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  uploadMaterial,
  getAllMaterials,
  purchaseMaterial,
  getMaterialAccess,
  getMyPurchases,
  getTeacherMaterials,
};
