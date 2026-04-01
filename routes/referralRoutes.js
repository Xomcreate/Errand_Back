import express from "express";
import {
  getReferralKpis,
  getReferralActivity,
  processPayout,
  createReferral,
} from "../controllers/referralController.js";
import { protect, admin } from "../middleware/authMiddleware.js";

const router = express.Router();

// USER routes
router.get("/kpis", protect, getReferralKpis);
router.get("/activity", protect, getReferralActivity);
router.post("/", protect, createReferral);

// ADMIN route
router.patch("/payout/:id", protect, admin, processPayout);

export default router;