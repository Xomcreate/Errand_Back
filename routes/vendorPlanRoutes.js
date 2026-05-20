import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { getMyPlan, initializeUpgrade, verifyUpgrade } from "../controllers/vendorPlanController.js";

const router = express.Router();

router.get("/",             protect, getMyPlan);
router.post("/initialize",  protect, initializeUpgrade);
router.post("/verify",      protect, verifyUpgrade);

export default router;