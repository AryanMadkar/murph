const User = require("../models/user.models");
const axios = require("axios");
const FormData = require("form-data");

const AI_SERVICE_URL = process.env.AI_SERVICE_URL;

const register = async (req, res) => {
  try {
    const { email, role, secretKey } = req.body;

    if (!email || !role || !req.file)
      return res.status(400).json({ message: "Missing fields" });

    if (secretKey !== process.env.REGISTRATION_SECRET)
      return res.status(403).json({ message: "Invalid secret" });

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
    if (!req.file) return res.status(400).json({ message: "Image required" });

    const formData = new FormData();
    formData.append("file", req.file.buffer, {
      filename: req.file.originalname,
      contentType: req.file.mimetype,
    });

    const encodeRes = await axios.post(`${AI_SERVICE_URL}/encode`, formData, {
      headers: formData.getHeaders(),
    });

    if (!encodeRes.data.success)
      return res.status(400).json({ message: "Face not detected" });

    const newEmbedding = encodeRes.data.embedding;

    // get all users
    const users = await User.find();

    let bestMatch = null;
    let bestDistance = Infinity;

    for (const user of users) {
      const matchRes = await axios.post(
        `${AI_SERVICE_URL}/match`,
        {
          new_embedding: newEmbedding,
          stored_embeddings: user.embeddings,
        },
        { headers: { "Content-Type": "application/json" } },
      );

      if (matchRes.data.match && matchRes.data.distance < bestDistance) {
        bestDistance = matchRes.data.distance;
        bestMatch = user;
      }
    }

    if (!bestMatch)
      return res.status(401).json({ message: "No face match found" });

    res.json({
      success: true,
      userId: bestMatch._id,
      email: bestMatch.email,
      role: bestMatch.role,
      distance: bestDistance,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  register,
  login,
};
