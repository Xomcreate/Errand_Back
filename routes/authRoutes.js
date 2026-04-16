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
  getMe
} from "../controllers/authController.js";
import { upload } from "../middleware/upload.js";



const router = express.Router();

router.post("/register", registerUser);
router.post("/login", loginUser);

// Users management
router.get("/users", getAllUsers);
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


export default router;
