import express from "express";
import {
  getCart,
  addToCart,
  updateCartItem,
  removeCartItem,
} from "../controllers/cartController.js";
import { protect } from "../middleware/authMiddleware.js"; // JWT auth middleware

const router = express.Router();

router.route("/")
  .get(protect, getCart)
  .post(protect, addToCart);

router.route("/:id")
  .put(protect, updateCartItem)
  .delete(protect, removeCartItem);

export default router;