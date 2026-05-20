import express from "express";
import Notification from "../models/Notification.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// GET /api/notifications — all notifications for the logged-in user
router.get("/", protect, async (req, res) => {
  try {
    const notifications = await Notification.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(50);
    res.json({ success: true, notifications });
  } catch (err) {
    console.error("Notification fetch error:", err);
    res.status(500).json({ success: false, message: "Could not load notifications" });
  }
});

// PATCH /api/notifications/read-all — mark all as read
// ⚠️ MUST be before /:id/read so Express doesn't treat "read-all" as an :id
router.patch("/read-all", protect, async (req, res) => {
  try {
    await Notification.updateMany(
      { userId: req.user.id, isRead: false },
      { isRead: true }
    );
    res.json({ success: true });
  } catch (err) {
    console.error("Mark all read error:", err);
    res.status(500).json({ success: false, message: "Could not mark all as read" });
  }
});

// PATCH /api/notifications/:id/read — mark one notification as read
router.patch("/:id/read", protect, async (req, res) => {
  try {
    await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { isRead: true }
    );
    res.json({ success: true });
  } catch (err) {
    console.error("Mark read error:", err);
    res.status(500).json({ success: false, message: "Could not mark notification as read" });
  }
});

export default router;