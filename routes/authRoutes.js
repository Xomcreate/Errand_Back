import express from "express";
import { protect, admin } from "../middleware/authMiddleware.js";
import {
  registerUser,
  loginUser,
  getAllUsers,
  deleteUser,
  resetPassword,
  toggleStatus,
  updateProfile,
  toggleVerification,
  getMe,
  saveBankDetails,
  getBanksList,
  verifyBankAccount,
  getVendorBankDetails,
  submitKyc,
  getPendingKyc,
  reviewKyc,
} from "../controllers/authController.js";
import { upload } from "../middleware/upload.js";

const router = express.Router();

router.post("/register", registerUser);
router.post("/login", loginUser);

// Users management — admin only
router.get("/users", protect, admin, getAllUsers);
router.delete("/users/:id", protect, admin, deleteUser);
router.post("/users/:id/reset-password", protect, admin, resetPassword);
router.patch("/users/:id/toggle-status", protect, admin, toggleStatus);
router.patch("/users/:id/toggle-verify", protect, admin, toggleVerification);
router.get("/users/:id/bank-details", protect, admin, getVendorBankDetails);

// Bank details — logged-in user acting on their own account
router.get("/banks", protect, getBanksList);
router.post("/bank-details", protect, saveBankDetails);
router.get("/verify-account", protect, verifyBankAccount);

router.get("/me", protect, getMe);

router.put(
  "/users/:id",
  protect,
  upload.single("profileImage"),
  updateProfile
);

// KYC
router.post(
  "/kyc",
  protect,
  upload.fields([
    { name: "document", maxCount: 1 },
    { name: "selfie", maxCount: 1 },
  ]),
  submitKyc
);
router.get("/kyc/pending", protect, admin, getPendingKyc);
router.patch("/users/:id/kyc-review", protect, admin, reviewKyc);

export default router;