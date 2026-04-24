import express from "express";
import {
  createOrder,
  getAllOrders,
  getMyOrders,
  getOrderById,
  updateOrderStatus,
  getVendorOrders,
} from "../controllers/orderController.js";
import { protect, admin } from "../middleware/authMiddleware.js"; // ✅ changed adminOnly → admin

const router = express.Router();

// POST /api/orders/checkout — create order
router.post("/checkout", protect, createOrder);

// GET /api/orders — admin gets all orders
router.get("/", protect, admin, getAllOrders); // ✅ changed adminOnly → admin

// GET /api/orders/my — logged in user gets their orders
router.get("/my", protect, getMyOrders);

// GET /api/orders/vendor — vendor gets their orders
router.get("/vendor", protect, getVendorOrders);

// GET /api/orders/:id — get single order
router.get("/:id", protect, getOrderById);

// PUT /api/orders/:id/status — admin updates status
router.put("/:id/status", protect, admin, updateOrderStatus); // ✅ changed adminOnly → admin

export default router;