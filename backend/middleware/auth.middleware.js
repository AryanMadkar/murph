const jwt = require("jsonwebtoken");
const User = require("../models/user.models");

/**
 * Auth Middleware
 * 
 * Verifies JWT token and attaches user to request
 * 
 * Usage:
 * - Add to routes that require authentication
 * - Access user via req.user
 */
const authMiddleware = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token provided" });
    }

    const token = authHeader.split(" ")[1];

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "murph_secret_key");

    // Get user from database
    const user = await User.findById(decoded.userId || decoded.id);

    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    // Attach user to request
    req.user = user;
    next();
  } catch (error) {
    console.error("Auth middleware error:", error.message);
    
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({ error: "Invalid token" });
    }
    
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token expired" });
    }
    
    res.status(401).json({ error: "Authentication failed" });
  }
};

module.exports = authMiddleware;
