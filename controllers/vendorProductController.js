import VendorProduct from "../models/VendorProduct.js";
import VendorPlan from "../models/VendorPlan.js";
import { PLAN_CONFIG } from "../config/commissionConfig.js";
import { uploadToCloudinary } from "../utils/uploadToCloudinary.js"; // ← adjust path to match your project

// ── Helper: resolve effective plan (handles expiry) ──────────────────────────
const resolveEffectivePlan = async (vendorPlan, vendorId) => {
  const isExpired =
    vendorPlan.plan !== "basic" &&
    vendorPlan.planExpiresAt &&
    new Date() > new Date(vendorPlan.planExpiresAt);

  if (isExpired) {
    const resetPlan = await VendorPlan.findOneAndUpdate(
      { vendorId },
      {
        plan:         "basic",
        isVerified:   false,
        productLimit: PLAN_CONFIG.basic.productLimit,
      },
      { new: true }
    );
    return resetPlan;
  }

  return vendorPlan;
};

// ================= CREATE PRODUCT =================
export const createVendorProduct = async (req, res) => {
  try {
    const { name, category, price, stock } = req.body;
    const vendorId = req.user.id;

    if (!name || !category || !price) {
      return res.status(400).json({ message: "Name, category and price are required." });
    }

    // 1. Get or create vendor plan
    let vendorPlan = await VendorPlan.findOne({ vendorId });
    if (!vendorPlan) {
      const config = PLAN_CONFIG.basic;
      vendorPlan = await VendorPlan.create({
        vendorId,
        plan:         "basic",
        isVerified:   config.isVerified,
        productLimit: config.productLimit,
      });
    }

    // 2. Resolve effective plan — resets DB if expired
    vendorPlan = await resolveEffectivePlan(vendorPlan, vendorId);

    const effectiveLimit = vendorPlan.productLimit;

    // 3. Count existing products
    const productCount = await VendorProduct.countDocuments({ vendorId });

    // 4. Block if limit reached
    if (productCount >= effectiveLimit) {
      return res.status(403).json({
        success:      false,
        limitReached: true,
        currentPlan:  vendorPlan.plan,
        limit:        effectiveLimit,
        message: `You've used all ${effectiveLimit} product slots on your ${vendorPlan.plan} plan. Upgrade to post more.`,
      });
    }

    // 5. Upload image to Cloudinary (if provided)
    let imageUrl = "";
    if (req.file) {
      try {
        const result = await uploadToCloudinary(req.file.buffer, {
          folder: "vendor-products",
        });
        imageUrl = result.secure_url;
      } catch (uploadErr) {
        return res.status(500).json({ message: "Image upload failed. Please try again." });
      }
    }

    // 6. Create product — inherit isVerified from current (effective) plan
    const product = await VendorProduct.create({
      vendorId,
      name,
      category,
      price,
      stock:             stock || 0,
      image:             imageUrl,
      isVerifiedListing: vendorPlan.isVerified,
    });

    res.status(201).json({ success: true, product });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ================= GET LOGGED-IN VENDOR PRODUCTS =================
export const getVendorProducts = async (req, res) => {
  try {
    const vendorId = req.user.id;

    const products = await VendorProduct.find({ vendorId }).sort({ createdAt: -1 });

    let vendorPlan = await VendorPlan.findOne({ vendorId });
    if (!vendorPlan) {
      const config = PLAN_CONFIG.basic;
      vendorPlan = await VendorPlan.create({
        vendorId,
        plan:         "basic",
        isVerified:   config.isVerified,
        productLimit: config.productLimit,
      });
    }

    vendorPlan = await resolveEffectivePlan(vendorPlan, vendorId);

    res.json({ success: true, products, plan: vendorPlan });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ================= DELETE PRODUCT =================
export const deleteVendorProduct = async (req, res) => {
  try {
    const product = await VendorProduct.findOne({
      _id:      req.params.id,
      vendorId: req.user.id,
    });

    if (!product) {
      return res.status(404).json({ message: "Product not found or not yours." });
    }

    await product.deleteOne();
    res.json({ success: true, message: "Product deleted." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ================= PUBLIC STORE PRODUCTS =================
export const getVendorProductsByVendorId = async (req, res) => {
  try {
    const products = await VendorProduct.find({
      vendorId:  req.params.id,
      published: true,
    }).sort({ createdAt: -1 });
    res.json({ success: true, products });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};