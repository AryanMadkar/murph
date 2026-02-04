const User = require("../models/user.models");
const axios = require("axios");
const FormData = require("form-data");
const jwt = require("jsonwebtoken");

const AI_AUTH_URL = process.env.AI_AUTH_URL || "http://localhost:8000";
const AI_SERVICE_URL = process.env.AI_AUTH_URL || "http://localhost:8000";
const JWT_SECRET =
  process.env.JWT_SECRET || "murph_secret_key";

const generateToken = (userId) => {
  return jwt.sign({ id: userId, userId: userId }, JWT_SECRET, { expiresIn: "7d" });
};

const register = async (req, res) => {
  try {
    const { email, role } = req.body;

    if (!email || !role || !req.file) {
      return res
        .status(400)
        .json({ success: false, message: "Missing required fields" });
    }

    const exists = await User.findOne({ email });
    if (exists) {
      return res
        .status(400)
        .json({ success: false, message: "User already exists" });
    }

    // Encode face using AI service
    const formData = new FormData();
    formData.append("file", req.file.buffer, {
      filename: req.file.originalname,
      contentType: req.file.mimetype,
    });

    console.log(`Encoding face for registration: ${email}`);
    const aiRes = await axios.post(`${AI_AUTH_URL}/encode`, formData, {
      headers: formData.getHeaders(),
    });

    if (!aiRes.data.success)
      return res.status(400).json({ message: "Face not detected" });

    const newUser = await User.create({
      email,
      role,
      embedding: aiRes.data.embedding,
      embedding: aiRes.data.embedding,
    });

    // ✅ Generate JWT token on registration
    const token = generateToken(newUser._id);

    res.status(201).json({
      success: true,
      message: "Registration successful",
      token,
      user: {
        email: newUser.email,
        role: newUser.role,
        id: newUser._id,
        walletBalance: (newUser.walletBalance || 0) / 100,
      },
    });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: err.message });
  }
};

const login = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !req.file) {
      return res
        .status(400)
        .json({ success: false, message: "Email and image are required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // Encode new face
    const formData = new FormData();
    formData.append("file", req.file.buffer, {
      filename: req.file.originalname,
      contentType: req.file.mimetype,
    });

    // 2. Encode the uploaded face
    console.log("Encoding face for login...");
    const encodeResponse = await axios.post(`${AI_SERVICE_URL}/encode`, formData, {
      headers: formData.getHeaders(),
      timeout: 10000,
    });

    if (!encodeResponse.data.success) {
      return res
        .status(400)
        .json({ success: false, message: "Face not detected in image" });
    }

    // 3. Match faces using Python AI service
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
      }
    );

    if (matchResponse.data.match) {
      const token = generateToken(user._id);
      res.json({
        success: true,
        message: "Login successful",
        token,
        user: {
          id: user._id,
          email: user.email,
          role: user.role,
          walletBalance: (user.walletBalance || 0) / 100,
        },
      });
    } else {
      res
        .status(401)
        .json({ success: false, message: "Face verification failed" });
    }
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  register,
  login,
};
