import express from "express";
import multer from "multer";

import {
  createVendorProduct,
  getVendorProducts,
  deleteVendorProduct,
} from "../controllers/vendorProductController.js";

import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// IMAGE UPLOAD
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({ storage });

// CREATE PRODUCT
router.post("/", protect, upload.single("image"), createVendorProduct);

// GET VENDOR PRODUCTS
router.get("/", protect, getVendorProducts);

// DELETE PRODUCT
router.delete("/:id", protect, deleteVendorProduct);

export default router;