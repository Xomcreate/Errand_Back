import express from "express";
import {
  getPublicServices,
  getPublicServiceById,
  getAllServicesAdmin,
  createService,
  updateService,
  deleteService,
  getServiceStats,
  expireListings,
} from "../controllers/serviceController.js";

import { protect, admin } from "../middleware/authMiddleware.js";
import { upload } from "../middleware/upload.js";

const router = express.Router();

// ── Admin — stats / lifecycle ─────────────────────────────────────────────────
router.get("/admin/stats",          protect, admin, getServiceStats);
router.patch("/admin/expire-check", protect, admin, expireListings);

// ── Admin — CRUD (upload.single("image") handles multipart; no separate upload route needed) ──
router.get("/admin/all",    protect, admin, getAllServicesAdmin);
router.post("/admin",       protect, admin, upload.single("image"), createService);
router.patch("/admin/:id",  protect, admin, upload.single("image"), updateService);
router.delete("/admin/:id", protect, admin, deleteService);

// ── Public ────────────────────────────────────────────────────────────────────
router.get("/",    getPublicServices);
router.get("/:id", getPublicServiceById);

export default router;