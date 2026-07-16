import express from "express";
import {
  getWallet,
  payWithWallet,
  getTransactions,
  adminCredit,
} from "../controllers/walletController.js";
import { protect, admin } from "../middleware/authMiddleware.js";

const router = express.Router();

// ── User routes ───────────────────────────────────────────────────────────────
router.get("/",              protect,        getWallet);         // GET  /api/wallet
router.get("/transactions",  protect,        getTransactions);   // GET  /api/wallet/transactions
router.post("/pay",          protect,        payWithWallet);     // POST /api/wallet/pay

// ── Admin routes ──────────────────────────────────────────────────────────────
router.post("/admin/credit", protect, admin, adminCredit);       // POST /api/wallet/admin/credit

export default router;