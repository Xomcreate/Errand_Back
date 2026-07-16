import mongoose from "mongoose";
import User from "../models/User.js";
import Order from "../models/Order.js";
import WalletTransaction from "../models/WalletTransaction.js";
import Notification from "../models/Notification.js";

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL HELPER — credit or debit a user's wallet atomically.
// ─────────────────────────────────────────────────────────────────────────────
export const applyWalletTransaction = async ({
  userId,
  type,
  amount,
  description,
  source,
  orderId    = null,
  referralId = null,
}) => {
  if (!amount || amount <= 0) throw new Error("Transaction amount must be positive");

  // FIX: Normalise userId to a plain ObjectId string so findByIdAndUpdate
  // works regardless of whether caller passes a string, ObjectId, or populated doc.
  const uid = userId?._id ?? userId;

  let user;

  if (type === "credit") {
    // FIX: Use $inc with $set fallback — if walletBalance field never existed on
    // an old user document, $inc on undefined initialises it to `amount` correctly
    // in MongoDB, but we also ensure the field is set to 0 first via $setOnInsert
    // isn't needed here — MongoDB $inc on a missing field treats missing as 0.
    // This is fine as-is; just making the intent explicit.
    user = await User.findByIdAndUpdate(
      uid,
      { $inc: { walletBalance: amount } },
      { new: true, runValidators: false }
    );
    if (!user) throw new Error(`User ${uid} not found when applying wallet credit`);

  } else if (type === "debit") {
    // Atomic conditional debit — only succeeds if balance is sufficient.
    // Prevents race conditions: two simultaneous debits cannot both pass the
    // balance check and double-spend.
    user = await User.findOneAndUpdate(
      {
        _id:           uid,
        walletBalance: { $gte: amount },
      },
      { $inc: { walletBalance: -amount } },
      { new: true, runValidators: false }
    );

    if (!user) {
      // Distinguish "user missing" from "balance too low" for clearer error messages
      const exists = await User.findById(uid).select("walletBalance");
      if (!exists) throw new Error(`User ${uid} not found when applying wallet debit`);
      throw new Error(
        `Insufficient wallet balance — required ₦${amount}, available ₦${exists.walletBalance || 0}`
      );
    }

  } else {
    throw new Error(`Invalid transaction type "${type}" — must be "credit" or "debit"`);
  }

  // Record the transaction
  await WalletTransaction.create({
    user:         uid,
    type,
    amount,
    description,
    source,
    orderId,
    referralId,
    balanceAfter: user.walletBalance,
    status:       "Completed",
  });

  console.log(
    `[Wallet] ${type.toUpperCase()} ₦${amount} | user: ${uid} | source: ${source} | balance after: ₦${user.walletBalance}`
  );

  return user;
};

// ─────────────────────────────────────────────────────────────────────────────
// GET WALLET SUMMARY
// GET /api/wallet
// ─────────────────────────────────────────────────────────────────────────────
export const getWallet = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("walletBalance name email");
    if (!user) return res.status(404).json({ message: "User not found" });

    // FIX: getWallet was fetching transactions here AND the frontend was also
    // calling /wallet/transactions separately (with pagination). Removed the
    // duplicate transaction fetch here — balance-only is all this endpoint needs.
    // The frontend Wallet.jsx already calls both endpoints in parallel correctly.
    res.json({
      success:       true,
      walletBalance: user.walletBalance || 0,
    });
  } catch (err) {
    console.error("[Wallet] getWallet error:", err.message);
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PAY WITH WALLET
// POST /api/wallet/pay
// Body: { orderId }
// ─────────────────────────────────────────────────────────────────────────────
export const payWithWallet = async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ message: "orderId is required" });

    const [user, order] = await Promise.all([
      User.findById(req.user.id),
      Order.findById(orderId),
    ]);

    if (!user)  return res.status(404).json({ message: "User not found" });
    if (!order) return res.status(404).json({ message: "Order not found" });

    if (order.user.toString() !== req.user.id)
      return res.status(403).json({ message: "This is not your order" });

    if (!["pending", "unpaid"].includes(order.paymentStatus))
      return res.status(400).json({ message: "This order has already been paid" });

    if (order.status === "cancelled")
      return res.status(400).json({ message: "Cannot pay for a cancelled order" });

    const balance = user.walletBalance || 0;
    if (balance < order.totalAmount) {
      return res.status(400).json({
        message:   "Insufficient wallet balance",
        required:  order.totalAmount,
        available: balance,
        shortfall: +(order.totalAmount - balance).toFixed(2),
      });
    }

    const shortId = order._id.toString().slice(-6).toUpperCase();

    await applyWalletTransaction({
      userId:      req.user.id,
      type:        "debit",
      amount:      order.totalAmount,
      description: `Payment for Order #${shortId}`,
      source:      "order_payment",
      orderId:     order._id,
    });

    order.paymentStatus = "paid";
    order.status        = "paid";
    order.paidAt        = new Date();
    order.paymentMethod = "wallet";
    await order.save();

    await Notification.create({
      userId:  req.user.id,
      type:    "payment_confirmed",
      title:   "Payment confirmed 💰",
      message: `₦${order.totalAmount.toLocaleString()} was deducted from your wallet for Order #${shortId}.`,
      orderId: order._id,
    });

    const updatedUser = await User.findById(req.user.id).select("walletBalance");

    res.json({
      success:    true,
      message:    "Payment successful",
      order,
      newBalance: updatedUser.walletBalance,
    });
  } catch (err) {
    console.error("[Wallet] payWithWallet error:", err.message);
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET ALL TRANSACTIONS (paginated)
// GET /api/wallet/transactions?page=1&limit=20
// ─────────────────────────────────────────────────────────────────────────────
export const getTransactions = async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const skip  = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      WalletTransaction.find({ user: req.user.id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("orderId", "_id totalAmount")
        .lean(),
      WalletTransaction.countDocuments({ user: req.user.id }),
    ]);

    res.json({
      success:    true,
      transactions,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      hasMore:    skip + transactions.length < total,
    });
  } catch (err) {
    console.error("[Wallet] getTransactions error:", err.message);
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: MANUAL CREDIT
// POST /api/wallet/admin/credit
// Body: { userId, amount, note }
// ─────────────────────────────────────────────────────────────────────────────
export const adminCredit = async (req, res) => {
  try {
    const { userId, amount, note } = req.body;

    if (!userId)               return res.status(400).json({ message: "userId is required" });
    if (!amount || amount <= 0) return res.status(400).json({ message: "A positive amount is required" });

    const user = await applyWalletTransaction({
      userId,
      type:        "credit",
      amount,
      description: note || "Admin wallet credit",
      source:      "admin_adjustment",
    });

    res.json({
      success:    true,
      message:    "Wallet credited successfully",
      newBalance: user.walletBalance,
    });
  } catch (err) {
    console.error("[Wallet] adminCredit error:", err.message);
    res.status(500).json({ message: err.message });
  }
};