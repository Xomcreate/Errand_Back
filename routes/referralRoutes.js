import express from "express";
import {
  getReferralKpis,
  getReferralActivity,
  getAdminReferralKpis,      // FIX: new platform-wide KPI endpoint
  getAdminReferralActivity,  // FIX: new platform-wide activity endpoint
  processPayout,
  createReferral,
  registerReferral,
  getMyReferralLink,
} from "../controllers/referralController.js";
import { protect, admin } from "../middleware/authMiddleware.js";

const router = express.Router();

// ── User routes ───────────────────────────────────────────────────────────────
router.get("/my-link",   protect,        getMyReferralLink);   // GET  /api/referrals/my-link
router.get("/kpis",      protect,        getReferralKpis);     // GET  /api/referrals/kpis
router.get("/activity",  protect,        getReferralActivity); // GET  /api/referrals/activity
router.post("/register", protect,        registerReferral);    // POST /api/referrals/register
router.post("/",         protect,        createReferral);      // POST /api/referrals  (legacy)

// ── Admin routes ──────────────────────────────────────────────────────────────
// FIX: /admin/kpis and /admin/activity are now platform-wide, not user-scoped
router.get("/admin/kpis",      protect, admin, getAdminReferralKpis);     // GET  /api/referrals/admin/kpis
router.get("/admin/activity",  protect, admin, getAdminReferralActivity); // GET  /api/referrals/admin/activity
router.patch("/payout/:id",    protect, admin, processPayout);            // PATCH /api/referrals/payout/:id

export default router;