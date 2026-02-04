const User = require("../models/user.models");
const axios = require("axios");
const FormData = require("form-data");
const jwt = require("jsonwebtoken");

const AI_AUTH_URL = process.env.AI_AUTH_URL;

const register = async (req, res) => {
  try {
    const { email, role } = req.body;

    if (!email || !role || !req.file)
      return res.status(400).json({ message: "Missing fields" });

    const exists = await User.findOne({ email });
    if (exists) return res.status(400).json({ message: "User exists" });

    const formData = new FormData();
    formData.append("file", req.file.buffer, {
      filename: req.file.originalname,
      contentType: req.file.mimetype,
    });

    const aiRes = await axios.post(`${AI_SERVICE_URL}/encode`, formData, {
      headers: formData.getHeaders(),
    });

    if (!aiRes.data.success)
      return res.status(400).json({ message: "Face not detected" });

    const user = await User.create({
      email,
      role,
      embeddings: [aiRes.data.embedding],
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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const login = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email required" });
    if (!req.file) return res.status(400).json({ message: "Image required" });

    // 1. Find the specific user
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });

    const formData = new FormData();
    formData.append("file", req.file.buffer, {
      filename: req.file.originalname,
      contentType: req.file.mimetype,
    });

    // 2. Encode the uploaded face
    console.log("Encoding face for login...");
    let encodeRes;
    try {
      encodeRes = await axios.post(`${AI_SERVICE_URL}/encode`, formData, {
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
          // Sending user object for frontend consistency
          id: user._id,
          email: user.email,
          role: user.role,
          id: user._id,
          walletBalance: user.walletBalance / 100,
        },
      });
    } else {
      console.log("Face mismatch.");
      res.status(401).json({ message: "Face verification failed" });
    }
  } catch (err) {
    console.error("Login error (General):", err);
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  register,
  login,
};
