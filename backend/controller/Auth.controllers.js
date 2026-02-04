const User = require("../models/user.models");
const axios = require("axios");
const FormData = require("form-data");
const jwt = require("jsonwebtoken");

const AI_SERVICE_URL = process.env.AI_SERVICE_URL;
const JWT_SECRET = process.env.JWT_SECRET || "murph_secret_key_change_in_production";

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign(
    { id: userId },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
};

const register = async (req, res) => {
  try {
    const { email, role, secretKey } = req.body;

    // Security Check
    const REQUIRED_SECRET = process.env.REGISTRATION_SECRET || "admin123";
    if (secretKey !== REQUIRED_SECRET) {
      return res.status(403).json({
        success: false,
        message: "Invalid registration secret. Please contact administrator.",
      });
    }

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    if (!role || !["teacher", "student"].includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Role is required and must be 'teacher' or 'student'",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Image is required",
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "User already exists",
      });
    }

    // Send image to Python AI service for encoding
    const formData = new FormData();
    formData.append("file", req.file.buffer, {
      filename: req.file.originalname,
      contentType: req.file.mimetype,
    });

    const aiResponse = await axios.post(`${AI_SERVICE_URL}/encode`, formData, {
      headers: formData.getHeaders(),
      timeout: 20000,
    });

    if (!aiResponse.data.success) {
      return res.status(400).json({
        success: false,
        message: aiResponse.data.error || "Face not detected",
      });
    }

    // Save user to database
    const newUser = new User({
      email,
      role,
      embedding: aiResponse.data.embedding,
    });

    await newUser.save();

    // ✅ Generate JWT token on registration
    const token = generateToken(newUser._id);

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      token,
      user: {
        email: newUser.email,
        role: newUser.role,
        id: newUser._id,
        walletBalance: newUser.walletBalance / 100,
      },
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};

const login = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Image is required",
      });
    }

    // Find user in database
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Send image to Python AI service for encoding
    const formData = new FormData();
    formData.append("file", req.file.buffer, {
      filename: req.file.originalname,
      contentType: req.file.mimetype,
    });

    const encodeResponse = await axios.post(
      `${AI_SERVICE_URL}/encode`,
      formData,
      {
        headers: formData.getHeaders(),
        timeout: 10000,
      },
    );

    if (!encodeResponse.data.success) {
      return res.status(400).json({
        success: false,
        message: encodeResponse.data.error || "Face not detected",
      });
    }

    // Match faces using Python AI service
    const matchPayload = {
      new_embedding: encodeResponse.data.embedding,
      stored_embeddings: [user.embedding],
    };

    const matchResponse = await axios.post(
      `${AI_SERVICE_URL}/match`,
      matchPayload,
      {
        headers: { "Content-Type": "application/json" },
        timeout: 10000,
      },
    );

    if (matchResponse.data.match) {
      // ✅ Generate JWT token on successful login
      const token = generateToken(user._id);

      res.json({
        success: true,
        message: "✅ Login successful",
        match: true,
        distance: matchResponse.data.distance,
        token,
        user: {
          email: user.email,
          role: user.role,
          id: user._id,
          walletBalance: user.walletBalance / 100,
        },
      });
    } else {
      res.status(401).json({
        success: false,
        message: "❌ Face does not match",
        match: false,
      });
    }
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};

module.exports = {
  register,
  login,
};
