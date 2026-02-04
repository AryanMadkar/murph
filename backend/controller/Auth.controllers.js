const User = require("../models/user.models");
const axios = require("axios");
const FormData = require("form-data");

const AI_SERVICE_URL = process.env.AI_SERVICE_URL;

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

    res.json({
      success: true,
      userId: user._id,
      email,
      role,
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
      });
    } catch (aiErr) {
      console.error("AI Service Encode Error:", aiErr.message);
      return res
        .status(500)
        .json({ message: "AI Service Unavailable (Encode)" });
    }

    if (!encodeRes.data.success) {
      console.log("Face detection failed during login.");
      return res.status(400).json({ message: "Face not detected in image" });
    }

    const newEmbedding = encodeRes.data.embedding;

    // 3. Match against THIS user's embeddings
    let storedEmbeddings = user.embeddings;

    // Check for legacy data and migrate if needed
    if (
      (!storedEmbeddings || storedEmbeddings.length === 0) &&
      user.embedding &&
      user.embedding.length > 0
    ) {
      console.log(
        `Migrating legacy user ${user.email} to new embeddings format...`,
      );
      storedEmbeddings = [user.embedding];

      // Save the migration
      user.embeddings = storedEmbeddings;
      user.embedding = undefined; // Clear old field
      await user.save();
      console.log("Migration successful.");
    }

    if (!storedEmbeddings || storedEmbeddings.length === 0) {
      console.error(
        "User has no registered face embeddings (even after migration check).",
      );
      return res
        .status(500)
        .json({ message: "User data corrupted (No face data)" });
    }

    console.log(
      `Matching against user ${user.email} with ${storedEmbeddings.length} embeddings...`,
    );

    let matchRes;
    try {
      matchRes = await axios.post(
        `${AI_SERVICE_URL}/match`,
        {
          new_embedding: newEmbedding,
          stored_embeddings: storedEmbeddings,
        },
        { headers: { "Content-Type": "application/json" } },
      );
    } catch (aiErr) {
      console.error(
        "AI Service Match Error:",
        aiErr.response?.data || aiErr.message,
      );
      return res.status(500).json({ message: "AI Service Error (Match)" });
    }

    if (matchRes.data.match) {
      console.log("Login successful!");
      res.json({
        success: true,
        userId: user._id,
        email: user.email,
        role: user.role,
        distance: matchRes.data.distance,
        user: {
          // Sending user object for frontend consistency
          id: user._id,
          email: user.email,
          role: user.role,
          walletBalance: user.walletBalance,
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
