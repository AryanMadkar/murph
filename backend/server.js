const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");
require("dotenv").config();

const http = require("http");
const setupSocket = require("./socket/socket");

const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 5000;

// Setup Socket.io
setupSocket(server);

const authRoutes = require("./routes/auth.routes");
const meetingRoutes = require("./routes/meeting.routes");

app.use(cors());
app.use(express.json());

app.use("/api", authRoutes);
app.use("/api/meetings", meetingRoutes);
app.use("/api/payment", require("./routes/payment.routes"));
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
    const users = await User.find({}, "email role createdAt");
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

connectDB()
  .then(() => {
    console.log("MongoDB connected");
  })
  .catch((error) => {
    console.log("MongoDB connection error", error);
  });

server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
