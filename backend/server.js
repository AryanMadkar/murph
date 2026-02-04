const path = require("path");
const express = require("express");
const cors = require("cors");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const connectDB = require("./config/db");

const http = require("http");
const setupSocket = require("./socket/socket");

const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 5000;

// Setup Socket.io
setupSocket(server);

const authRoutes = require("./routes/auth.routes");
const meetingRoutes = require("./routes/meeting.routes");
const walletRoutes = require("./routes/wallet.routes");
const escrowRoutes = require("./routes/escrow.routes");
const materialRoutes = require("./routes/material.routes");
const recommendationRoutes = require("./routes/recommendation.routes");

app.use(cors());
app.use(express.json());

app.use("/api", authRoutes);
app.use("/api/meetings", meetingRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/escrow", escrowRoutes);
app.use("/api/materials", materialRoutes);
app.use("/api/recommendations", recommendationRoutes);
app.use("/api/attention", require("./routes/Attention.routes"));
app.use("/api/insights", require("./routes/insights.routes"));

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Server is running",
    timestamp: new Date().toISOString(),
  });
});

// ============= GET ALL USERS (for testing) =============
app.get("/api/users", async (req, res) => {
  const User = require("./models/user.models");
  try {
    const users = await User.find({}, "email role createdAt walletBalance");
    res.json({
      success: true,
      users,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// ============= TEST LOGIN (for testing wallet without face auth) =============
app.post("/api/test-login", async (req, res) => {
  const User = require("./models/user.models");
  const jwt = require("jsonwebtoken");
  const JWT_SECRET =
    process.env.JWT_SECRET || "murph_secret_key_change_in_production";

  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: "7d" });

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        walletBalance: user.walletBalance / 100,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

connectDB()
  .then(() => {
    console.log("MongoDB connected");
  })
  .catch((error) => {
    console.log("MongoDB connection error", error);
  });

server.listen(port, "0.0.0.0", () => {
  console.log(`Server is running on http://0.0.0.0:${port}`);
});
