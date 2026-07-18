import express from "express";
import { protect, admin } from "../middleware/authMiddleware.js";
import {
  getMyPlan,
  initializeUpgrade,
  verifyUpgrade,
  getAllVendorPlans,
} from "../controllers/vendorPlanController.js";

const router = express.Router();

router.get("/",             protect, getMyPlan);
router.post("/initialize",  protect, initializeUpgrade);
router.post("/verify",      protect, verifyUpgrade);

// ✅ ADMIN — list every vendor and the plan they've paid for
router.get("/admin/all", protect, admin, getAllVendorPlans);

export default router;