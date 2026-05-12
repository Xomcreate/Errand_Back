import express from "express";
import {
  createOrder,
  getAllOrders,
  getMyOrders,
  getOrderById,
  updateOrderStatus,
  deleteOrder,
  deleteAllOrders,
  getOrderCommission,
  getVendorOrders,
  saveDeliveryInfo,
  vendorMarkShipped,
  adminMarkShipped,
  customerConfirmReceived,
  releaseVendorPayment,
  raiseDispute,
} from "../controllers/orderController.js";
import { protect, admin } from "../middleware/authMiddleware.js";
import { upload } from "../middleware/upload.js";

const router = express.Router();

// ── Customer / order creation ─────────────────────────────────────────────────
router.post("/checkout",         protect,        createOrder);
router.get("/my",                protect,        getMyOrders);
router.get("/vendor",            protect,        getVendorOrders);
router.put("/:id/delivery",      protect,        saveDeliveryInfo);
router.post("/:id/dispute",      protect,        raiseDispute);

// ── Admin — order management ──────────────────────────────────────────────────
router.get("/",                  protect, admin, getAllOrders);
router.get("/:id",               protect,        getOrderById);
router.put("/:id/status",        protect, admin, updateOrderStatus);

// ── Admin — delete ────────────────────────────────────────────────────────────
// DELETE /api/orders/all          → delete ALL orders (requires X-Confirm-Delete header)
// DELETE /api/orders/:id          → delete a single order by ID
router.delete("/all",            protect, admin, deleteAllOrders);
router.delete("/:id",            protect, admin, deleteOrder);

// ── Admin — commission ────────────────────────────────────────────────────────
// GET /api/orders/:id/commission  → per-party commission breakdown for one order
router.get("/:id/commission",    protect, admin, getOrderCommission);

// ── Shipping / escrow / proof ─────────────────────────────────────────────────
router.put("/:id/vendor-ship",      protect,        upload.single("photo"), vendorMarkShipped);
router.put("/:id/admin-ship",       protect, admin, upload.single("photo"), adminMarkShipped);
router.put("/:id/customer-confirm", protect,        upload.single("photo"), customerConfirmReceived);
router.put("/:id/release-payment",  protect, admin,                         releaseVendorPayment);

export default router;