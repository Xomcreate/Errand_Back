import express from "express";
import { upload } from "../middleware/upload.js";
import { getCategories, createCategory, updateCategory, deleteCategory } from "../controllers/categoryController.js";

const router = express.Router();

router.get("/", getCategories);
router.post("/", upload.single("image"), createCategory);
router.put("/:id", upload.single("image"), updateCategory);
router.delete("/:id", deleteCategory);

export default router;