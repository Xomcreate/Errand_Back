import VendorReview from "../models/VendorReview.js";

// CREATE REVIEW
export const createVendorReview = async (req, res) => {
  try {
    const { vendorId, rating, comment } = req.body;

    const review = await VendorReview.create({
      vendorId,
      rating,
      comment,
      userName: req.user?.name || "Anonymous",
      status: "pending",
    });

    res.status(201).json({ review });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUBLIC (ONLY APPROVED)
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

// VENDOR DASHBOARD (ALL)
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

// APPROVE
export const approveReview = async (req, res) => {
  try {
    const review = await VendorReview.findByIdAndUpdate(
      req.params.id,
      { status: "approved" },
      { new: true }
    );

    res.json({ review });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// REJECT
export const rejectReview = async (req, res) => {
  try {
    const review = await VendorReview.findByIdAndUpdate(
      req.params.id,
      { status: "rejected" },
      { new: true }
    );

    res.json({ review });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};