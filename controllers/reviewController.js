const Review = require("../models/Review");
const { uploadToCloudinary } = require("../utils/uploadToCloudinary");

// PUBLIC → approved only
exports.getReviews = async (req, res) => {
  try {
    const reviews = await Review.find({ approved: true }).sort({ createdAt: -1 });
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ADMIN → all reviews
exports.getAllReviews = async (req, res) => {
  try {
    const reviews = await Review.find().sort({ createdAt: -1 });
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// CREATE review
exports.createReview = async (req, res) => {
  const { name, rating, comment } = req.body;

  if (!name || !rating || !comment) {
    return res.status(400).json({ message: "All fields required" });
  }

  try {
    let photoUrl = null;

    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer, {
        folder: "reviews",
      });
      photoUrl = result.secure_url;
    }

    const review = new Review({
      name,
      rating,
      comment,
      photo: photoUrl, // full Cloudinary URL, or null if no photo uploaded
      approved: false, // ALWAYS false on submit
    });

    await review.save();
    res.status(201).json(review);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ADMIN approve
exports.approveReview = async (req, res) => {
  try {
    const review = await Review.findByIdAndUpdate(
      req.params.id,
      { approved: true },
      { new: true }
    );
    res.json(review);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ADMIN disapprove (hide)
exports.disapproveReview = async (req, res) => {
  try {
    const review = await Review.findByIdAndUpdate(
      req.params.id,
      { approved: false },
      { new: true }
    );
    res.json(review);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};