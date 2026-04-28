import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
  initPaystackPayment,
  verifyPaystackPayment,
} from "../controllers/paystackController.js";

const router = express.Router();

router.post("/paystack", protect, initPaystackPayment);
router.get("/paystack/verify/:reference", protect, verifyPaystackPayment);

export default router;