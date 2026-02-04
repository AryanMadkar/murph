const User = require("../models/user.models");
const axios = require("axios");
const FormData = require("form-data");
const jwt = require("jsonwebtoken");

const AI_AUTH_URL = process.env.AI_AUTH_URL;
const JWT_SECRET =
  process.env.JWT_SECRET || "murph_secret_key_change_in_production";

const generateToken = (id) => {
  return jwt.sign({ id }, JWT_SECRET, { expiresIn: "7d" });
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

    if (!aiRes.data.success) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Face not detected. Please try again.",
        });
    }

    // Create user in DB
    const user = await User.create({
      email,
      role,
      embedding: aiRes.data.embedding,
    });

    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      message: "Registration successful",
      token,
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        walletBalance: user.walletBalance / 100,
      },
    });
  } catch (err) {
    console.error("Registration error:", err.message);
    res.status(500).json({ success: false, error: err.message });
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

    console.log(`Verifying login for: ${email}`);
    const encodeRes = await axios.post(`${AI_AUTH_URL}/encode`, formData, {
      headers: formData.getHeaders(),
      timeout: 10000,
    });

    if (!encodeRes.data.success) {
      return res
        .status(400)
        .json({ success: false, message: "Face not detected in image" });
    }

    // Match against stored embedding
    const matchRes = await axios.post(
      `${AI_AUTH_URL}/match`,
      {
        new_embedding: encodeRes.data.embedding,
        stored_embeddings: [user.embedding],
      },
      {
        headers: { "Content-Type": "application/json" },
        timeout: 10000,
      }
    );

    if (matchRes.data.match) {
      const token = generateToken(user._id);
      res.json({
        success: true,
        message: "Login successful",
        token,
        user: {
          id: user._id,
          email: user.email,
          role: user.role,
          walletBalance: user.walletBalance / 100,
        },
      });
    } else {
      res
        .status(401)
        .json({ success: false, message: "Face verification failed" });
    }
  } catch (err) {
    console.error("Login error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

module.exports = {
  register,
  login,
};
