import express from "express";
import {
  createVendorReview,
  getVendorReviews,
  getVendorReviewsForVendor,
  approveReview,
  rejectReview,
} from "../controllers/vendorReviewController.js";

const router = express.Router();

// ================= CREATE REVIEW =================
router.post("/", createVendorReview);

// ================= VENDOR DASHBOARD (ALL REVIEWS) =================
router.get("/vendor/:vendorId", getVendorReviewsForVendor);

// ================= PUBLIC (APPROVED ONLY) =================
router.get("/public/:vendorId", getVendorReviews);

// ================= APPROVE / REJECT =================
router.patch("/:id/approve", approveReview);
router.patch("/:id/reject", rejectReview);

export default router;