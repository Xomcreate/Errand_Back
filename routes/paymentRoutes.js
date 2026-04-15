import express from "express";
import { payForOrder } from "../controllers/paymentController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/pay", protect, payForOrder);

export default router;