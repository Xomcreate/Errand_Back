import express from "express";

import {
  createVendorProduct,
  getVendorProducts,
  deleteVendorProduct,
  getVendorProductsByVendorId,
} from "../controllers/vendorProductController.js";

import { protect } from "../middleware/authMiddleware.js";
import { upload } from "../middleware/upload.js"; // ← adjust path if it lives elsewhere

const router = express.Router();

// ================= CREATE PRODUCT =================
router.post(
  "/",
  protect,
  upload.single("image"),
  createVendorProduct
);

// ================= GET LOGGED-IN VENDOR PRODUCTS =================
router.get("/", protect, getVendorProducts);

// ================= GET PUBLIC STORE PRODUCTS =================
router.get("/vendor/:id", getVendorProductsByVendorId);

// ================= DELETE PRODUCT =================
router.delete("/:id", protect, deleteVendorProduct);

export default router;