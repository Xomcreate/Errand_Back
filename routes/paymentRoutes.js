import express from "express";
import { protect, admin } from "../middleware/authMiddleware.js";
import {
  initPaystackPayment,
  verifyBankAccount,
  verifyPaystackPayment,
} from "../controllers/paystackController.js";
import {
  getAllPayments,
  refundPayment,
  getVendorEarnings,
  getVendorEarningsByAdmin,
} from "../controllers/paymentController.js";

const router = express.Router();

// ── Paystack ──────────────────────────────────────────────────────────────────
router.post("/paystack", protect, initPaystackPayment);
router.get("/paystack/verify/:reference", protect, verifyPaystackPayment);

// ── Admin ─────────────────────────────────────────────────────────────────────
router.get("/", protect, admin, getAllPayments);
router.post("/:id/refund", protect, admin, refundPayment);
router.get("/verify-account", protect, admin, verifyBankAccount);

// Admin: view any vendor's earnings & payout history
router.get("/admin/vendor/:vendorId/earnings", protect, admin, getVendorEarningsByAdmin);

// ── Vendor ────────────────────────────────────────────────────────────────────
// Vendor: own earnings summary + payout history
router.get("/vendor/earnings", protect, getVendorEarnings);

export default router;
