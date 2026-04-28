import VendorReview from "../models/VendorReview.js";

// ================= CREATE REVIEW =================
export const createVendorReview = async (req, res) => {
  try {
    const { vendorId, rating, comment } = req.body;

    if (!vendorId || !rating || !comment) {
      return res.status(400).json({ message: "vendorId, rating, and comment are required." });
    }

    const review = await VendorReview.create({
      vendorId,
      rating,
      comment,
      userName: req.user?.name || "Anonymous",
      userId: req.user?._id || null,
      status: "pending",
    });

    res.status(201).json({ message: "Review submitted and awaiting approval.", review });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ================= PUBLIC — APPROVED ONLY =================
export const getVendorReviews = async (req, res) => {
  try {
    const reviews = await VendorReview.find({
      vendorId: req.params.vendorId,
      status: "approved",
    }).sort({ createdAt: -1 });

    res.json({ reviews });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ================= VENDOR DASHBOARD — ALL REVIEWS =================
export const getVendorReviewsForVendor = async (req, res) => {
  try {
    const reviews = await VendorReview.find({
      vendorId: req.params.vendorId,
    }).sort({ createdAt: -1 });

    res.json({ reviews });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ================= ADMIN — ALL REVIEWS FOR ALL VENDORS =================
export const getAllReviews = async (req, res) => {
  try {
    const reviews = await VendorReview.find().sort({ createdAt: -1 });
    res.json({ reviews });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ================= APPROVE =================
export const approveReview = async (req, res) => {
  try {
    const review = await VendorReview.findByIdAndUpdate(
      req.params.id,
      { status: "approved" },
      { new: true }
    );

    if (!review) return res.status(404).json({ message: "Review not found." });

    res.json({ message: "Review approved.", review });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ================= REJECT =================
export const rejectReview = async (req, res) => {
  try {
    const review = await VendorReview.findByIdAndUpdate(
      req.params.id,
      { status: "rejected" },
      { new: true }
    );

    if (!review) return res.status(404).json({ message: "Review not found." });

    res.json({ message: "Review rejected.", review });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ================= DELETE =================
export const deleteReview = async (req, res) => {
  try {
    const review = await VendorReview.findByIdAndDelete(req.params.id);
    if (!review) return res.status(404).json({ message: "Review not found." });
    res.json({ message: "Review deleted." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};