import mongoose from "mongoose";
import asyncHandler from "express-async-handler";
import Referral from "../models/Referral.js";
import User from "../models/User.js";
import { applyWalletTransaction } from "./walletController.js";
import Notification from "../models/Notification.js";

// ─────────────────────────────────────────────────────────────────────────────
// CASHBACK TIER CONFIG
// ─────────────────────────────────────────────────────────────────────────────
export const getReferrerTierRate = (successfulReferrals) => {
  if (successfulReferrals >= 10) return 0.10;
  if (successfulReferrals >= 5)  return 0.07;
  return 0.05;
};

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL — called from orderController when an order is fully delivered.
// ─────────────────────────────────────────────────────────────────────────────
export const processReferralReward = async (order) => {
  // FIX: Derive refereeId correctly whether order.user is populated or a raw ObjectId
  const refereeId =
    order.user?._id?.toString() ??
    order.user?.toString() ??
    null;

  console.log(`[Referral] processReferralReward triggered | orderId: ${order._id} | refereeId: ${refereeId}`);

  if (!refereeId) {
    console.warn("[Referral] processReferralReward: order.user is missing — skipping");
    return;
  }

  try {
    // FIX: Query only on referee + credit flags — don't assume status is "Clicked".
    // If a previous attempt partially credited one party but not the other,
    // the individual flags catch it correctly regardless of status string.
    const referral = await Referral.findOne({
      referee:          refereeId,
      referrerCredited: false,
      refereeCredited:  false,
    }).populate("referrer", "name email");

    if (!referral) {
      console.log(`[Referral] No uncredited referral found for referee ${refereeId} — skipping (already processed or never referred)`);
      return;
    }

    console.log(`[Referral] Found referral ${referral._id} | referrer: ${referral.referrer?._id} | status: ${referral.status}`);

    if (!referral.referrer) {
      console.warn(`[Referral] Referrer user no longer exists for referral ${referral._id} — skipping`);
      return;
    }

    if (referral.referrer._id.toString() === refereeId) {
      console.warn(`[Referral] Self-referral detected for referral ${referral._id} — skipping`);
      return;
    }

    const orderTotal = order.totalAmount || 0;
    if (orderTotal <= 0) {
      console.warn(`[Referral] Order ${order._id} has zero/negative total (${orderTotal}) — skipping`);
      return;
    }

    // Count how many PREVIOUS successful referrals this referrer has (excluding current)
    const existingConversions = await Referral.countDocuments({
      referrer: referral.referrer._id,
      status:   "Converted",
    });

    const tierRate         = getReferrerTierRate(existingConversions);
    const referrerCashback = +(orderTotal * tierRate).toFixed(2);
    const refereeCashback  = +(orderTotal * 0.05).toFixed(2);

    console.log(`[Referral] Tier: ${(tierRate * 100).toFixed(0)}% (${existingConversions} prior conversions) | referrer gets ₦${referrerCashback} | referee gets ₦${refereeCashback}`);

    // FIX: Mark BOTH flags atomically BEFORE crediting wallets to prevent
    // double-processing if this function is called twice for the same order
    // (e.g. network retry or duplicate event). If wallet credit then fails,
    // the catch block logs it clearly.
    referral.status           = "Converted";
    referral.orderId          = order._id;
    referral.tierApplied      = +(tierRate * 100);
    referral.referrerReward   = referrerCashback;
    referral.refereeReward    = refereeCashback;
    referral.reward           = referrerCashback;
    referral.referrerCredited = true;
    referral.refereeCredited  = true;
    await referral.save();

    console.log(`[Referral] Referral ${referral._id} marked Converted — crediting wallets...`);

    // ── Credit REFERRER ──────────────────────────────────────────────────────
    await applyWalletTransaction({
      userId:      referral.referrer._id,
      type:        "credit",
      amount:      referrerCashback,
      description: `Referral cashback (${(tierRate * 100).toFixed(0)}%) — ${order.user?.name || "a new user"}'s first order #${order._id.toString().slice(-6).toUpperCase()}`,
      source:      "referral_cashback",
      orderId:     order._id,
      referralId:  referral._id,
    });

    console.log(`[Referral] ✅ Referrer ${referral.referrer._id} credited ₦${referrerCashback}`);

    await Notification.create({
      userId:  referral.referrer._id,
      type:    "referral_reward",
      title:   "Referral cashback earned! 🎉",
      message: `You earned ₦${referrerCashback.toLocaleString()} (${(tierRate * 100).toFixed(0)}% cashback) from your referral completing their first order.`,
      orderId: order._id,
    });

    // ── Credit REFEREE (welcome cashback) ────────────────────────────────────
    // FIX: Use mongoose.Types.ObjectId consistently — refereeId is a string here
    const refereeObjectId = new mongoose.Types.ObjectId(refereeId);

    await applyWalletTransaction({
      userId:      refereeObjectId,
      type:        "credit",
      amount:      refereeCashback,
      description: `Welcome cashback (5%) on your first order #${order._id.toString().slice(-6).toUpperCase()}`,
      source:      "welcome_cashback",
      orderId:     order._id,
      referralId:  referral._id,
    });

    console.log(`[Referral] ✅ Referee ${refereeId} credited ₦${refereeCashback}`);

    await Notification.create({
      userId:  refereeObjectId,
      type:    "welcome_cashback",
      title:   "Welcome cashback credited! 🎁",
      message: `₦${refereeCashback.toLocaleString()} (5% of your first order) has been added to your wallet.`,
      orderId: order._id,
    });

    console.log(`[Referral] ✅ Fully processed referral ${referral._id} | referrer ₦${referrerCashback} | referee ₦${refereeCashback}`);

  } catch (err) {
    // FIX: Log the FULL error including stack so you can actually diagnose it.
    // Previously only err.message was logged which hides the source location.
    console.error(`[Referral] ❌ processReferralReward FAILED for order ${order._id} | referee ${refereeId}`);
    console.error(`[Referral] Error: ${err.message}`);
    console.error(`[Referral] Stack: ${err.stack}`);

    // NOTE: We intentionally do NOT re-throw here — a failed referral reward
    // must never block the order delivery confirmation flow.
    // Monitor logs for [Referral] ❌ to catch any failures.
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// REGISTER A REFERRAL CLICK
// POST /api/referrals/register
// Body: { referrerCode }
// ─────────────────────────────────────────────────────────────────────────────
export const registerReferral = asyncHandler(async (req, res) => {
  const newUserId = req.user.id;
  const { referrerCode } = req.body;

  if (!referrerCode)
    return res.status(400).json({ message: "referrerCode is required" });

  const referrer = await User.findOne({
    $or: [
      { _id: mongoose.isValidObjectId(referrerCode) ? referrerCode : null },
      { referralCode: referrerCode },
    ],
  });

  if (!referrer)
    return res.status(404).json({ message: "Referral code not found" });

  if (referrer._id.toString() === newUserId)
    return res.status(400).json({ message: "You cannot refer yourself" });

  const existing = await Referral.findOne({ referee: newUserId });
  if (existing)
    return res.status(400).json({ message: "You have already used a referral code" });

  const newUser = await User.findById(newUserId).select("email name");
  if (!newUser)
    return res.status(404).json({ message: "User not found" });

  const referral = await Referral.create({
    referrer:     referrer._id,
    referee:      newUserId,
    refereeEmail: newUser.email,
    status:       "Clicked",
  });

  console.log(`[Referral] Registered: referrer ${referrer._id} → referee ${newUserId}`);

  res.status(201).json({ success: true, referral });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET MY REFERRAL LINK
// GET /api/referrals/my-link
// ─────────────────────────────────────────────────────────────────────────────
export const getMyReferralLink = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).select("referralCode _id");
  if (!user) return res.status(404).json({ message: "User not found" });

  const code    = user.referralCode || user._id.toString();
  const baseUrl = process.env.FRONTEND_URL || "http://localhost:5173";

  res.json({
    success:      true,
    referralCode: code,
    referralLink: `${baseUrl}/register?ref=${code}`,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET REFERRAL KPIs — USER SCOPE
// GET /api/referrals/kpis
// ─────────────────────────────────────────────────────────────────────────────
export const getReferralKpis = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const [
    totalReferredUsers,
    successfulConversions,
    pendingPayoutsAgg,
    totalReferralRevenueAgg,
  ] = await Promise.all([
    Referral.countDocuments({ referrer: userId }),
    Referral.countDocuments({ referrer: userId, status: "Converted" }),
    Referral.aggregate([
      { $match: { referrer: new mongoose.Types.ObjectId(userId), status: "Pending Payout" } },
      { $group: { _id: null, total: { $sum: "$referrerReward" } } },
    ]),
    Referral.aggregate([
      { $match: { referrer: new mongoose.Types.ObjectId(userId), status: "Converted" } },
      { $group: { _id: null, total: { $sum: "$referrerReward" } } },
    ]),
  ]);

  const tierRate            = getReferrerTierRate(successfulConversions);
  const nextTierAt          = successfulConversions < 5 ? 5 : successfulConversions < 10 ? 10 : null;
  const nextTierRate        = nextTierAt === 5 ? 7 : nextTierAt === 10 ? 10 : null;
  const referralsToNextTier = nextTierAt ? nextTierAt - successfulConversions : 0;

  res.json({
    totalReferredUsers,
    successfulConversions,
    pendingPayouts:       pendingPayoutsAgg[0]?.total       || 0,
    totalReferralRevenue: totalReferralRevenueAgg[0]?.total || 0,
    currentTierRate:      +(tierRate * 100),
    nextTierAt,
    nextTierRate,
    referralsToNextTier,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN KPIs — PLATFORM-WIDE (no referrer filter)
// GET /api/referrals/admin/kpis
// ─────────────────────────────────────────────────────────────────────────────
export const getAdminReferralKpis = asyncHandler(async (req, res) => {
  const [
    totalReferredUsers,
    successfulConversions,
    pendingPayoutsAgg,
    totalReferralRevenueAgg,
  ] = await Promise.all([
    Referral.countDocuments({}),
    Referral.countDocuments({ status: "Converted" }),
    Referral.aggregate([
      { $match: { status: "Pending Payout" } },
      { $group: { _id: null, total: { $sum: "$referrerReward" } } },
    ]),
    Referral.aggregate([
      { $match: { status: "Converted" } },
      { $group: { _id: null, total: { $sum: "$referrerReward" } } },
    ]),
  ]);

  res.json({
    totalReferredUsers,
    successfulConversions,
    pendingPayouts:       pendingPayoutsAgg[0]?.total       || 0,
    totalReferralRevenue: totalReferralRevenueAgg[0]?.total || 0,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET REFERRAL ACTIVITY — USER SCOPE
// GET /api/referrals/activity
// ─────────────────────────────────────────────────────────────────────────────
export const getReferralActivity = asyncHandler(async (req, res) => {
  const activity = await Referral.find({ referrer: req.user.id })
    .populate("referrer", "name email")
    .populate("referee",  "name email")
    .sort({ createdAt: -1 });

  res.json(activity);
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN ACTIVITY — PLATFORM-WIDE (no referrer filter)
// GET /api/referrals/admin/activity
// ─────────────────────────────────────────────────────────────────────────────
export const getAdminReferralActivity = asyncHandler(async (req, res) => {
  const activity = await Referral.find({})
    .populate("referrer", "name email")
    .populate("referee",  "name email")
    .sort({ createdAt: -1 });

  res.json(activity);
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: PROCESS MANUAL PAYOUT OVERRIDE
// PATCH /api/referrals/payout/:id
// ─────────────────────────────────────────────────────────────────────────────
export const processPayout = asyncHandler(async (req, res) => {
  const referral = await Referral.findById(req.params.id).populate("referrer", "name email");

  if (!referral) {
    res.status(404);
    throw new Error("Referral not found");
  }

  if (referral.status === "Converted" || referral.referrerCredited) {
    return res.status(400).json({ message: "Payout already processed for this referral" });
  }

  if (!referral.referrer) {
    return res.status(400).json({ message: "Referrer user no longer exists" });
  }

  const payout = referral.referrerReward || 0;

  if (payout <= 0) {
    return res.status(400).json({ message: "No reward amount set on this referral — cannot process payout" });
  }

  // Mark before crediting to prevent double-processing
  referral.status           = "Converted";
  referral.referrerCredited = true;
  await referral.save();

  await applyWalletTransaction({
    userId:      referral.referrer._id,
    type:        "credit",
    amount:      payout,
    description: `Manual referral payout (admin) — ₦${payout.toLocaleString()} for referral #${referral._id.toString().slice(-6).toUpperCase()}`,
    source:      "referral_cashback",
    referralId:  referral._id,
  });

  await Notification.create({
    userId:  referral.referrer._id,
    type:    "referral_reward",
    title:   "Referral reward credited! 🎉",
    message: `₦${payout.toLocaleString()} referral cashback has been added to your wallet.`,
  });

  res.json({ message: "Payout processed and wallet credited successfully", referral });
});

// ─────────────────────────────────────────────────────────────────────────────
// CREATE REFERRAL (legacy / manual)
// POST /api/referrals
// ─────────────────────────────────────────────────────────────────────────────
export const createReferral = asyncHandler(async (req, res) => {
  const { refereeEmail, reward = 0 } = req.body;
  if (!refereeEmail)
    return res.status(400).json({ message: "Referee email is required" });

  const referral = await Referral.create({
    referrer:     req.user.id,
    refereeEmail,
    reward,
    status:       "Clicked",
  });

  res.status(201).json(referral);
});