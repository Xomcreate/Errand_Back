// routes/productRoutes.js
import express from "express";
import { upload } from "../middleware/upload.js";
import { getProducts, createProduct, updateProduct, deleteProduct } from "../controllers/productController.js";

const router = express.Router();

// Routes
router.get("/", getProducts);
router.post("/", upload.single("image"), createProduct);
router.put("/:id", upload.single("image"), updateProduct);
router.delete("/:id", deleteProduct);

export default router; // ✅ ESM default export