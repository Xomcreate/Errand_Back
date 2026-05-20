import axios from "axios";
import Payment from "../models/Payment.js";
import Order from "../models/Order.js";
import User from "../models/User.js";
import VendorProduct from "../models/VendorProduct.js";
import Product from "../models/Product.js";
import { calcCommissionBreakdown } from "./orderController.js";

const PAYSTACK_API = "https://api.paystack.co";

// ─────────────────────────────────────────────────────────────────────────────
// INITIALIZE PAYSTACK PAYMENT (order checkout)
// POST /api/payments/paystack
// Body: { orderId }
// ─────────────────────────────────────────────────────────────────────────────
export const initializePaystackPayment = async (req, res) => {
  try {
    const { orderId } = req.body;
    const userId = req.user.id;

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Order not found" });

    if (order.user.toString() !== userId)
      return res.status(403).json({ message: "Not your order" });

    if (order.paymentStatus === "paid")
      return res.status(400).json({ message: "Order already paid" });

    const user = await User.findById(userId).select("name email");
    if (!user) return res.status(404).json({ message: "User not found" });

    const callbackUrl =
      process.env.NODE_ENV === "production"
        ? "https://your-production-domain.com/verify/payment"
        : "http://localhost:5173/verify/payment";

    const response = await axios.post(
      `${PAYSTACK_API}/transaction/initialize`,
      {
        email: user.email,
        amount: Math.round(order.totalAmount * 100), // kobo
        metadata: {
          orderId: orderId.toString(),
          userId: userId.toString(),
        },
        callback_url: callbackUrl,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const { authorization_url, reference } = response.data.data;

    // Save a pending payment record
    await Payment.create({
      userId,
      orderId,
      reference,
      amount: order.totalAmount,
      status: "pending",
      type: "payment",
    });

    res.json({ success: true, authorization_url, reference });
  } catch (err) {
    console.error("INIT PAYMENT ERROR:", err.response?.data || err.message);
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// VERIFY PAYSTACK PAYMENT (order checkout)
// GET /api/payments/paystack/verify/:reference
// ─────────────────────────────────────────────────────────────────────────────
export const verifyPaystackPayment = async (req, res) => {
  try {
    const { reference } = req.params;

    // Prevent double-processing
    const existingPayment = await Payment.findOne({ reference });
    if (existingPayment?.status === "success") {
      const order = await Order.findById(existingPayment.orderId);
      return res.json({ success: true, message: "Already paid", order });
    }

    // Verify with Paystack
    const response = await axios.get(
      `${PAYSTACK_API}/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        },
      }
    );

    const data = response.data.data;

    if (data.status !== "success") {
      return res.status(400).json({ message: "Payment not successful" });
    }

    const { orderId, userId } = data.metadata;

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Order not found" });

    // Amount check — Paystack returns amount in kobo
    const paidAmount = data.amount / 100;
    if (Math.round(paidAmount) !== Math.round(order.totalAmount)) {
      return res.status(400).json({ message: "Amount mismatch" });
    }

    // Mark order as paid
    order.paymentStatus = "paid";
    order.status = "paid";
    order.paidAt = new Date();
    order.paystackReference = reference;
    await order.save();

    // Update or create payment record
    await Payment.findOneAndUpdate(
      { reference },
      {
        userId,
        orderId,
        reference,
        amount: paidAmount,
        status: "success",
        type: "payment",
        paidAt: new Date(),
      },
      { upsert: true, new: true }
    );

    res.json({ success: true, order });
  } catch (err) {
    console.error("VERIFY PAYMENT ERROR:", err.response?.data || err.message);
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: GET ALL PAYMENTS
// ─────────────────────────────────────────────────────────────────────────────
export const getAllPayments = async (req, res) => {
  try {
    const payments = await Payment.find()
      .populate("userId", "name email")
      .populate("orderId")
      .sort({ createdAt: -1 });

    res.json({ success: true, payments });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: REFUND PAYMENT
// ─────────────────────────────────────────────────────────────────────────────
export const refundPayment = async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id);

    if (!payment) return res.status(404).json({ message: "Payment not found" });
    if (payment.type === "refund")
      return res.status(400).json({ message: "Payment already refunded" });
    if (!payment.reference)
      return res.status(400).json({ message: "No reference to refund" });

    const paystackRes = await axios.post(
      `${PAYSTACK_API}/refund`,
      {
        transaction: payment.reference,
        amount: Math.round(payment.amount * 100), // kobo
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!paystackRes.data.status)
      return res.status(400).json({ message: "Paystack refund failed" });

    payment.type = "refund";
    payment.status = "success";
    await payment.save();

    res.json({ success: true, message: "Refund successful", payment });
  } catch (err) {
    console.error("REFUND ERROR:", err.response?.data || err.message);
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// VENDOR: GET EARNINGS SUMMARY + PAYOUT HISTORY
// ─────────────────────────────────────────────────────────────────────────────
export const getVendorEarnings = async (req, res) => {
  try {
    const vendorId = req.user.id;

    const orders = await Order.find({ "partyPayouts.partyKey": vendorId })
      .select("_id totalAmount createdAt partyPayouts items deliveryInfo")
      .sort({ createdAt: -1 });

    if (!orders.length) {
      return res.json({
        success: true,
        summary: { totalGross: 0, totalCommissionDeducted: 0, totalEarned: 0, payoutCount: 0 },
        payouts: [],
      });
    }

    const payouts = orders.map((order) => {
      const payout = order.partyPayouts.find((p) => p.partyKey === vendorId);
      const vendorItems = order.items.filter((i) => i.vendorId?.toString() === vendorId);
      return {
        orderId:          order._id,
        orderCreatedAt:   order.createdAt,
        paidAt:           payout.paidAt,
        vendorPlan:       payout.vendorPlan       || "basic",
        gross:            payout.gross            || 0,
        commissionAmount: payout.commissionAmount || 0,
        net:              payout.net              || 0,
        effectiveRate:    payout.effectiveRate    || 0,
        note:             payout.note             || null,
        itemCount:        vendorItems.length,
        deliveryCity:     order.deliveryInfo?.city  || null,
        deliveryState:    order.deliveryInfo?.state || null,
      };
    });

    const totalGross              = payouts.reduce((s, p) => s + p.gross, 0);
    const totalCommissionDeducted = payouts.reduce((s, p) => s + p.commissionAmount, 0);
    const totalEarned             = payouts.reduce((s, p) => s + p.net, 0);

    res.json({
      success: true,
      summary: { totalGross, totalCommissionDeducted, totalEarned, payoutCount: payouts.length },
      payouts,
    });
  } catch (err) {
    console.error("VENDOR EARNINGS ERROR:", err.message);
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: GET ANY VENDOR'S EARNINGS (by vendorId param)
// ─────────────────────────────────────────────────────────────────────────────
export const getVendorEarningsByAdmin = async (req, res) => {
  try {
    const { vendorId } = req.params;
    if (!vendorId) return res.status(400).json({ message: "vendorId is required" });

    const orders = await Order.find({ "partyPayouts.partyKey": vendorId })
      .select("_id totalAmount createdAt partyPayouts items deliveryInfo")
      .sort({ createdAt: -1 });

    if (!orders.length) {
      return res.json({
        success: true,
        summary: { totalGross: 0, totalCommissionDeducted: 0, totalEarned: 0, payoutCount: 0 },
        payouts: [],
      });
    }

    const payouts = orders.map((order) => {
      const payout = order.partyPayouts.find((p) => p.partyKey === vendorId);
      const vendorItems = order.items.filter((i) => i.vendorId?.toString() === vendorId);
      return {
        orderId:          order._id,
        orderCreatedAt:   order.createdAt,
        paidAt:           payout.paidAt,
        vendorPlan:       payout.vendorPlan       || "basic",
        gross:            payout.gross            || 0,
        commissionAmount: payout.commissionAmount || 0,
        net:              payout.net              || 0,
        effectiveRate:    payout.effectiveRate    || 0,
        note:             payout.note             || null,
        itemCount:        vendorItems.length,
        deliveryCity:     order.deliveryInfo?.city  || null,
        deliveryState:    order.deliveryInfo?.state || null,
      };
    });

    const totalGross              = payouts.reduce((s, p) => s + p.gross, 0);
    const totalCommissionDeducted = payouts.reduce((s, p) => s + p.commissionAmount, 0);
    const totalEarned             = payouts.reduce((s, p) => s + p.net, 0);

    res.json({
      success: true,
      summary: { totalGross, totalCommissionDeducted, totalEarned, payoutCount: payouts.length },
      payouts,
    });
  } catch (err) {
    console.error("ADMIN VENDOR EARNINGS ERROR:", err.message);
    res.status(500).json({ message: err.message });
  }
};