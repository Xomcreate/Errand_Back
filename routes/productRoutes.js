import express from "express";
import {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct
} from "../controllers/productController.js";

import { upload } from "../middleware/upload.js";

const router = express.Router();

// ✅ GET ALL PRODUCTS (with ?category=)
router.get("/", getProducts);

// ✅ GET SINGLE PRODUCT
router.get("/:id", getProductById);

// ✅ CREATE PRODUCT (WITH IMAGE + BRAND)
router.post("/", upload.single("image"), createProduct);


// ✅ UPDATE PRODUCT
router.put("/:id", upload.single("image"), updateProduct);

// ✅ DELETE PRODUCT
router.delete("/:id", deleteProduct);

export default router;