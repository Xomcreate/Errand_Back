import express from "express";
import {
  createVendorReview,
  getVendorReviews,
  getVendorReviewsForVendor,
  getAllReviews,
  approveReview,
  rejectReview,
  deleteReview,
} from "../controllers/vendorReviewController.js";
import { protect } from "../middleware/authMiddleware.js"; // your existing auth middleware

const router = express.Router();

// ================= CREATE REVIEW (logged-in users only) =================
router.post("/", protect, createVendorReview);

// ================= PUBLIC — approved reviews only (no auth) =================
router.get("/public/:vendorId", getVendorReviews);

// ================= VENDOR DASHBOARD — all reviews for this vendor =================
router.get("/vendor/:vendorId", protect, getVendorReviewsForVendor);

// ================= ADMIN — all reviews across all vendors =================
router.get("/admin/all", protect, getAllReviews);

// ================= APPROVE / REJECT / DELETE =================
router.patch("/:id/approve", protect, approveReview);
router.patch("/:id/reject", protect, rejectReview);
router.delete("/:id", protect, deleteReview);

export default router;
