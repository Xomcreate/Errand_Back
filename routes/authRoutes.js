import express from "express";
import {
  registerUser,
  loginUser,
  getAllUsers,
  deleteUser,
  resetPassword,
  toggleStatus,
  updateProfile,
  toggleVerification
} from "../controllers/authController.js";



const router = express.Router();

router.post("/register", registerUser);
router.post("/login", loginUser);

// Users management
router.get("/users", getAllUsers);
router.delete("/users/:id", deleteUser);
router.post("/users/:id/reset-password", resetPassword);
router.patch("/users/:id/toggle-status", toggleStatus);
router.patch("/users/:id/toggle-verify", toggleVerification);
router.put("/users/:id", updateProfile);


export default router;
