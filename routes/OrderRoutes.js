import express from "express";
import {
  createOrder,
  getAllOrders,
  getMyOrders,
  getOrderById,
  updateOrderStatus,
  getVendorOrders,
  saveDeliveryInfo,
} from "../controllers/orderController.js";
import { protect, admin } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/checkout", protect, createOrder);
router.get("/", protect, admin, getAllOrders);
router.get("/my", protect, getMyOrders);
router.get("/vendor", protect, getVendorOrders);
router.get("/:id", protect, getOrderById);
router.put("/:id/delivery", protect, saveDeliveryInfo);
router.put("/:id/status", protect, admin, updateOrderStatus);

export default router;