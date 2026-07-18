import express from "express";
import { protect } from "../middleware/authMiddleware.js";
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
  submitKyc,
  getPendingKyc,
  reviewKyc,
} from "../controllers/authController.js";
import { upload } from "../middleware/upload.js";



const router = express.Router();

router.post("/register", registerUser);
router.post("/login", loginUser);

// Users management
router.get("/users", getAllUsers);
router.get("/banks", protect, getBanksList);
router.post("/bank-details", protect, saveBankDetails);
router.get("/verify-account", protect, verifyBankAccount);
router.delete("/users/:id", deleteUser);
router.get("/me", protect, getMe);
router.post("/users/:id/reset-password", resetPassword);
router.patch("/users/:id/toggle-status", toggleStatus);
router.patch("/users/:id/toggle-verify", toggleVerification);
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
router.get("/kyc/pending", protect, getPendingKyc);
router.patch("/users/:id/kyc-review", protect, reviewKyc);


export default router;