import express from "express";
import {
  createBooking,
  verifyBookingPayment,
  getBookingById,
  getAllBookingsAdmin,
  updateBookingStatus,
  getBookingStats,
  payBookingWithPaystack,
  payBookingWithCrypto,
  payBookingWithWallet,
} from "../controllers/bookingController.js";

// ── Your existing auth middleware — untouched ─────────────────────────────────
import { protect, admin } from "../middleware/authMiddleware.js";

const router = express.Router();

// ── ADMIN (specific paths first, before /:id) ─────────────────────────────────
router.get("/admin/stats",        protect, admin, getBookingStats);
router.get("/admin/all",          protect, admin, getAllBookingsAdmin);
router.patch("/admin/:id/status", protect, admin, updateBookingStatus);

// ── PUBLIC ─────────────────────────────────────────────────────────────────────
router.post("/",                 createBooking);
router.post("/verify-payment",   verifyBookingPayment);

// ── PAYMENT (booking fee — Paystack / Crypto are guest-friendly, Wallet requires login) ──
router.post("/:id/pay/paystack", payBookingWithPaystack);
router.post("/:id/pay/crypto",   payBookingWithCrypto);
router.post("/:id/pay/wallet",   protect, payBookingWithWallet);

router.get("/:id",               getBookingById);

export default router;