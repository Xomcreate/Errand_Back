import asyncHandler from "express-async-handler";
import Referral from "../models/Referral.js";
import User from "../models/User.js";

// @desc    Get referral KPIs for a user
// @route   GET /api/referrals/kpis
// @access  Private
export const getReferralKpis = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const totalReferredUsers = await Referral.countDocuments({ referrer: userId });
  const successfulConversions = await Referral.countDocuments({ referrer: userId, status: "Converted" });
  const pendingPayoutsAgg = await Referral.aggregate([
    { $match: { referrer: userId, status: "Pending Payout" } },
    { $group: { _id: null, totalReward: { $sum: "$reward" } } },
  ]);
  const totalReferralRevenueAgg = await Referral.aggregate([
    { $match: { referrer: userId, status: "Converted" } },
    { $group: { _id: null, totalRevenue: { $sum: "$reward" } } },
  ]);

  res.json({
    totalReferredUsers,
    successfulConversions,
    pendingPayouts: pendingPayoutsAgg[0]?.totalReward || 0,
    totalReferralRevenue: totalReferralRevenueAgg[0]?.totalRevenue || 0,
  });
});

// @desc    Get referral activity for a user
// @route   GET /api/referrals/activity
// @access  Private
export const getReferralActivity = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const activity = await Referral.find({ referrer: userId })
    .populate("referrer", "name email")
    .sort({ createdAt: -1 });

  res.json(activity);
});

// @desc    Process payout for a referral
// @route   PATCH /api/referrals/payout/:id
// @access  Private/Admin
export const processPayout = asyncHandler(async (req, res) => {
  const referral = await Referral.findById(req.params.id);

  if (!referral) {
    res.status(404);
    throw new Error("Referral not found");
  }

  // You could add admin validation here
  referral.payoutProcessed = true;
  referral.status = "Converted"; // Mark payout as completed
  await referral.save();

  res.json({ message: "Payout processed successfully", referral });
});

// @desc    Create a new referral
// @route   POST /api/referrals
// @access  Private
export const createReferral = asyncHandler(async (req, res) => {
  const { refereeEmail, reward = 0 } = req.body;

  if (!refereeEmail) {
    res.status(400);
    throw new Error("Referee email is required");
  }

  const referral = await Referral.create({
    referrer: req.user._id,
    refereeEmail,
    reward,
    status: "Clicked",
  });

  res.status(201).json(referral);
});