import axios from "axios";
import VendorPlan from "../models/VendorPlan.js";
import VendorProduct from "../models/VendorProduct.js";
import User from "../models/User.js";
import { PLAN_CONFIG } from "../config/commissionConfig.js";

// ── GET MY PLAN ──────────────────────────────────────────────────────────────
export const getMyPlan = async (req, res) => {
  try {
    const vendorId = req.user.id;

    let plan = await VendorPlan.findOne({ vendorId });

    if (!plan) {
      const config = PLAN_CONFIG.basic;
      plan = await VendorPlan.create({
        vendorId,
        plan:         "basic",
        isVerified:   config.isVerified,
        productLimit: config.productLimit,
      });
    }

    res.json({ success: true, plan });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── INITIALIZE PAYSTACK PAYMENT ──────────────────────────────────────────────
export const initializeUpgrade = async (req, res) => {
  try {
    const { targetPlan, returnPath } = req.body;
    const vendorId = req.user.id;

    if (!["silver", "gold"].includes(targetPlan)) {
      return res.status(400).json({ message: "Invalid plan selected." });
    }

    const currentPlan = await VendorPlan.findOne({ vendorId });

    if (currentPlan?.plan === targetPlan) {
      return res.status(400).json({ message: "You are already on this plan." });
    }

    const planRank = { basic: 0, silver: 1, gold: 2 };
    if (currentPlan && planRank[targetPlan] < planRank[currentPlan.plan]) {
      return res.status(400).json({ message: "Cannot downgrade your plan." });
    }

    const config = PLAN_CONFIG[targetPlan];
    const user   = await User.findById(vendorId);
    if (!user) return res.status(404).json({ message: "User not found." });

    // Derive frontend origin from request headers — no env variable needed
    const origin =
      req.headers.origin ||
      req.headers.referer?.split("/").slice(0, 3).join("/");

    if (!origin) {
      return res.status(400).json({ message: "Could not determine frontend origin." });
    }

    const basePath    = returnPath || "/seller";
    const callbackUrl = `${origin}${basePath}`;

    console.log("Paystack callback URL:", callbackUrl);

    const response = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      {
        email:    user.email,
        amount:   config.monthlyPrice * 100,
        metadata: {
          vendorId:   vendorId.toString(),
          targetPlan,
        },
        callback_url: callbackUrl,
      },
      {
        headers: {
          Authorization:  `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    res.json({
      success:          true,
      authorizationUrl: response.data.data.authorization_url,
      reference:        response.data.data.reference,
    });
  } catch (err) {
    console.error("INIT UPGRADE ERROR:", err.response?.data || err.message);
    res.status(500).json({ message: err.message });
  }
};

// ── VERIFY PAYMENT & UPGRADE PLAN ────────────────────────────────────────────
export const verifyUpgrade = async (req, res) => {
  try {
    const { reference } = req.body;

    if (!reference) {
      return res.status(400).json({ message: "Payment reference is required." });
    }

    // Prevent replaying the same reference twice
    const alreadyUsed = await VendorPlan.findOne({ paystackReference: reference });
    if (alreadyUsed) {
      const currentPlan = await VendorPlan.findOne({ vendorId: alreadyUsed.vendorId });
      return res.json({ success: true, plan: currentPlan });
    }

    // Verify with Paystack
    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        },
      }
    );

    const data = response.data.data;

    if (data.status !== "success") {
      return res.status(400).json({ message: "Payment was not successful." });
    }

    const { vendorId, targetPlan } = data.metadata;

    if (!vendorId || !targetPlan) {
      return res.status(400).json({ message: "Invalid payment metadata." });
    }

    if (!["silver", "gold"].includes(targetPlan)) {
      return res.status(400).json({ message: "Invalid plan in payment metadata." });
    }

    const config = PLAN_CONFIG[targetPlan];

    // 1. Update / create the VendorPlan document
    const updatedPlan = await VendorPlan.findOneAndUpdate(
      { vendorId },
      {
        plan:              targetPlan,
        isVerified:        config.isVerified,
        productLimit:      config.productLimit,
        paystackReference: reference,
        planExpiresAt:     new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
      { upsert: true, new: true }
    );

    // 2. Sync isVerified on the User document
    await User.findByIdAndUpdate(vendorId, {
      isVerified: config.isVerified,
    });

    // 3. Stamp all vendor products with new verified status
    await VendorProduct.updateMany(
      { vendorId },
      { isVerifiedListing: config.isVerified }
    );

    res.json({ success: true, plan: updatedPlan });
  } catch (err) {
    console.error("VERIFY UPGRADE ERROR:", err.response?.data || err.message);
    res.status(500).json({ message: err.message });
  }
};

// ── ADMIN: GET ALL VENDOR PLANS ──────────────────────────────────────────────
// Lists every vendor and the plan they're currently on / paid for.
export const getAllVendorPlans = async (req, res) => {
  try {
    const plans = await VendorPlan.find({})
      .populate("vendorId", "name email role")
      .sort({ createdAt: -1 });

    const formatted = plans.map((p) => ({
      _id: p._id,
      vendorId: p.vendorId?._id,
      vendorName: p.vendorId?.name || "Unknown",
      vendorEmail: p.vendorId?.email || "—",
      plan: p.plan,
      isVerified: p.isVerified,
      productLimit: p.productLimit,
      planExpiresAt: p.planExpiresAt,
      createdAt: p.createdAt,
    }));

    res.json({ success: true, count: formatted.length, vendors: formatted });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};