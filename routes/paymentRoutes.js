// routes/paymentRoutes.js
import express from "express"; // ✅ this was missing
import { protect, admin } from "../middleware/authMiddleware.js";
import { initPaystackPayment, verifyBankAccount, verifyPaystackPayment } from "../controllers/paystackController.js";
import { getAllPayments, refundPayment } from "../controllers/paymentController.js";

const router = express.Router();

router.post("/paystack", protect, initPaystackPayment);
router.get("/paystack/verify/:reference", protect, verifyPaystackPayment);

router.get("/", protect, admin, getAllPayments);
router.post("/:id/refund", protect, admin, refundPayment);
router.get("/verify-account", protect, admin, verifyBankAccount);

export default router;