import axios from "axios";
import crypto from "crypto";
import Payment from "../models/Payment.js";
import Order from "../models/Order.js";
import User from "../models/User.js";
import VendorProduct from "../models/VendorProduct.js";
import Product from "../models/Product.js";
import AdminPayout from "../models/AdminPayout.js";
import { calcCommissionBreakdown } from "./orderController.js";

const PAYSTACK_API = "https://api.paystack.co";
const isTestMode = process.env.PAYSTACK_SECRET_KEY?.startsWith("sk_test");

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

// ─────────────────────────────────────────────────────────────────────────────
// HELPER — compute platform profit from Order.partyPayouts
//
// totalCommission     = commission earned from every vendor payout ever released
// totalPlatformSales  = gross of every "__platform__" (admin's own items) payout released
// totalProfit         = totalCommission + totalPlatformSales
// totalReserved       = success + pending AdminPayout amounts (pending is reserved
//                        so two cashouts can't both draw from the same money while
//                        a Paystack transfer is still in flight)
// available           = totalProfit - totalReserved
// ─────────────────────────────────────────────────────────────────────────────
const computePlatformProfit = async () => {
  const [agg] = await Order.aggregate([
    { $unwind: "$partyPayouts" },
    {
      $group: {
        _id: null,
        totalCommission: {
          $sum: {
            $cond: [
              { $ne: ["$partyPayouts.partyKey", "__platform__"] },
              { $ifNull: ["$partyPayouts.commissionAmount", 0] },
              0,
            ],
          },
        },
        totalPlatformSales: {
          $sum: {
            $cond: [
              { $eq: ["$partyPayouts.partyKey", "__platform__"] },
              { $ifNull: ["$partyPayouts.gross", 0] },
              0,
            ],
          },
        },
      },
    },
  ]);

  const totalCommission    = agg?.totalCommission    || 0;
  const totalPlatformSales = agg?.totalPlatformSales || 0;
  const totalProfit        = totalCommission + totalPlatformSales;

  const reservedAgg = await AdminPayout.aggregate([
    { $match: { status: { $in: ["success", "pending"] } } },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]);
  const totalReserved = reservedAgg[0]?.total || 0;

  return {
    totalCommission,
    totalPlatformSales,
    totalProfit,
    totalReserved,
    available: Math.max(0, Math.round(totalProfit - totalReserved)),
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: GET PLATFORM PROFIT SUMMARY
// GET /api/payments/admin/profit
// ─────────────────────────────────────────────────────────────────────────────
export const getPlatformProfit = async (req, res) => {
  try {
    if (req.user.role !== "admin")
      return res.status(403).json({ message: "Admin only" });

    const summary = await computePlatformProfit();

    const history = await AdminPayout.find()
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({ success: true, summary, history });
  } catch (err) {
    console.error("GET PLATFORM PROFIT ERROR:", err.message);
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: CASH OUT PLATFORM PROFIT (real Paystack transfer)
// POST /api/payments/admin/cashout
// Body: { accountNumber, bankCode, amount }  ← amount optional, defaults to full available balance
// ─────────────────────────────────────────────────────────────────────────────
export const cashOutProfit = async (req, res) => {
  try {
    if (req.user.role !== "admin")
      return res.status(403).json({ message: "Admin only" });

    const { accountNumber, bankCode } = req.body;
    if (!accountNumber?.trim() || !bankCode?.trim())
      return res.status(400).json({ message: "Account number and bank code are required" });

    const { available } = await computePlatformProfit();
    if (available <= 0)
      return res.status(400).json({ message: "No profit available to cash out" });

    let amount = req.body.amount != null ? Number(req.body.amount) : available;
    if (!amount || amount <= 0)
      return res.status(400).json({ message: "Invalid amount" });
    if (amount > available)
      return res.status(400).json({ message: `Amount exceeds available balance (₦${available.toLocaleString()})` });

    // ── 1. Resolve account name ────────────────────────────────────────────
    let accountName = "TEST ADMIN ACCOUNT";
    let recipientCode = `TEST_RECIPIENT_${Date.now()}`;

    if (isTestMode) {
      console.log("⚠ Test mode: skipping Paystack verification for admin cashout");
    } else {
      const verify = await axios.get(
        `${PAYSTACK_API}/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
        { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
      );
      if (!verify.data.status)
        return res.status(400).json({ message: "Could not verify account" });
      accountName = verify.data.data.account_name;

      // ── 2. Create a transfer recipient ─────────────────────────────────
      const recipient = await axios.post(
        `${PAYSTACK_API}/transferrecipient`,
        {
          type:           "nuban",
          name:           accountName,
          account_number: accountNumber,
          bank_code:      bankCode,
          currency:       "NGN",
        },
        { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
      );
      recipientCode = recipient.data.data.recipient_code;
    }

    // ── 3. Create a pending ledger row FIRST — this reserves the amount so a
    // second concurrent cashout request can't also draw from the same balance
    // while this Paystack transfer is in flight. ──────────────────────────
    const reference = `ADMIN_PAYOUT_${crypto.randomUUID()}`;

    const payoutRecord = await AdminPayout.create({
      amount,
      accountNumber,
      accountName,
      bankCode,
      recipientCode,
      reference,
      status: "pending",
      initiatedBy: req.user.id,
    });

    // ── 4. Initiate the transfer ───────────────────────────────────────────
    if (isTestMode) {
      // In test mode there's no real transfer network — mark as success directly.
      payoutRecord.status = "success";
      payoutRecord.transferCode = `TEST_TRANSFER_${Date.now()}`;
      await payoutRecord.save();

      return res.json({
        success: true,
        message: "Test-mode cashout recorded (no real transfer sent).",
        payout: payoutRecord,
      });
    }

    try {
      const transfer = await axios.post(
        `${PAYSTACK_API}/transfer`,
        {
          source:    "balance",
          amount:    Math.round(amount * 100), // kobo
          recipient: recipientCode,
          reason:    "Platform profit withdrawal",
          reference,
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );

      const transferData = transfer.data.data;
      payoutRecord.transferCode = transferData.transfer_code;

      // Paystack may return status "success" immediately, or "otp"/"pending"
      // if OTP finalization is required on your account (Settings → Preferences
      // → disable OTP for API transfers to skip this in production).
      if (transferData.status === "success") {
        payoutRecord.status = "success";
      } else {
        payoutRecord.status = "pending"; // will be confirmed by the transfer webhook below
      }
      await payoutRecord.save();

      res.json({
        success: true,
        message:
          transferData.status === "success"
            ? "Cashout successful — funds sent."
            : "Transfer initiated — awaiting confirmation from Paystack.",
        payout: payoutRecord,
      });
    } catch (transferErr) {
      payoutRecord.status = "failed";
      payoutRecord.failureReason =
        transferErr.response?.data?.message || transferErr.message;
      await payoutRecord.save();

      console.error("ADMIN CASHOUT TRANSFER ERROR:", transferErr.response?.data || transferErr.message);
      res.status(500).json({
        message: "Transfer failed: " + (transferErr.response?.data?.message || transferErr.message),
      });
    }
  } catch (err) {
    console.error("CASH OUT PROFIT ERROR:", err.message);
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PAYSTACK WEBHOOK — handle transfer.success / transfer.failed / transfer.reversed
// so pending AdminPayout rows get confirmed once Paystack finishes processing.
//
// If you already have a webhook route (e.g. for the checkout charge.success
// event), just add this same block inside it — don't create two separate
// webhook endpoints, Paystack should hit ONE URL.
//
// POST /api/payments/webhook
// ─────────────────────────────────────────────────────────────────────────────
export const handleAdminTransferWebhook = async (req, res) => {
  try {
    // Verify the request really came from Paystack
    const hash = crypto
      .createHmac("sha512", process.env.PAYSTACK_SECRET_KEY)
      .update(JSON.stringify(req.body))
      .digest("hex");

    if (hash !== req.headers["x-paystack-signature"]) {
      return res.status(401).end();
    }

    const event = req.body;

    if (
      event.event === "transfer.success" ||
      event.event === "transfer.failed" ||
      event.event === "transfer.reversed"
    ) {
      const reference = event.data?.reference;
      const payout = await AdminPayout.findOne({ reference });
      if (payout) {
        if (event.event === "transfer.success") payout.status = "success";
        if (event.event === "transfer.failed") {
          payout.status = "failed";
          payout.failureReason = event.data?.reason || "Transfer failed";
        }
        if (event.event === "transfer.reversed") payout.status = "reversed";
        await payout.save();
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("ADMIN TRANSFER WEBHOOK ERROR:", err.message);
    res.sendStatus(200); // always 200 so Paystack doesn't retry endlessly
  }
};