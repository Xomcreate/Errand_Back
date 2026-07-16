import express from "express";
import {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  deleteAllProducts,
} from "../controllers/productController.js";

import { upload } from "../middleware/upload.js";

const router = express.Router();

router.get("/", getProducts);
router.get("/:id", getProductById);
router.post("/", upload.single("image"), createProduct);
router.put("/:id", upload.single("image"), updateProduct);

// ✅ DELETE ALL PRODUCTS — put before "/:id" for clarity
router.delete("/", deleteAllProducts);

// ✅ DELETE SINGLE PRODUCT
router.delete("/:id", deleteProduct);

export default router;