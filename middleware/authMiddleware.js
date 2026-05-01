// middleware/authMiddleware.js
import jwt from "jsonwebtoken";
import User from "../models/User.js";

export const protect = async (req, res, next) => {
  try {
    let token;

    // 1. Check Authorization header
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    // 2. HARD FIX: block undefined / invalid tokens
    if (!token || token === "undefined" || token === "null") {
      return res.status(401).json({
        message: "No token, please login",
      });
    }

    // 3. Verify token safely
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 4. Attach user to request
    req.user = await User.findById(decoded.id).select("-password");

    if (!req.user) {
      return res.status(401).json({
        message: "User not found",
      });
    }

    next();
  } catch (err) {
    console.error("JWT ERROR:", err.message);

    return res.status(401).json({
      message: "Invalid or expired token, please login again",
    });
  }
};

// Admin check middleware
export const admin = (req, res, next) => {
  if (req.user && req.user.role === "admin") {
    next();
  } else {
    res.status(403).json({ message: "Admin access required" });
  }
};