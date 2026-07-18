import express from "express";
import {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  deleteAllProducts,
  searchProducts,
} from "../controllers/productController.js";

import { getProductsBatch } from "../controllers/productBatchController.js";

import { upload } from "../middleware/upload.js";

const router = express.Router();

router.get("/", getProducts);

// ✅ SEARCH — must come before "/:id" or "search" gets treated as an id
router.get("/search", searchProducts);

// ✅ BATCH LOOKUP — used by Cart page to fetch only the products it needs
router.post("/batch", getProductsBatch);

router.get("/:id", getProductById);
router.post("/", upload.single("image"), createProduct);
router.put("/:id", upload.single("image"), updateProduct);

// ✅ DELETE ALL PRODUCTS — put before "/:id" for clarity
router.delete("/", deleteAllProducts);

// ✅ DELETE SINGLE PRODUCT
router.delete("/:id", deleteProduct);

export default router;