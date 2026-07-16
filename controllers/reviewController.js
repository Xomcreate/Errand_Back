const Review = require("../models/Review");
const { uploadToCloudinary } = require("../utils/uploadToCloudinary");
const cloudinary = require("../config/cloudinary");

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
    let photoPublicId = null;

    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer, {
        folder: "reviews",
      });
      photoUrl = result.secure_url;
      photoPublicId = result.public_id; // needed later to delete the image from Cloudinary
    }

    const review = new Review({
      name,
      rating,
      comment,
      photo: photoUrl, // full Cloudinary URL, or null if no photo uploaded
      photoPublicId, // Cloudinary asset id, or null — used for cleanup on delete
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

// ADMIN delete
exports.deleteReview = async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) {
      return res.status(404).json({ message: "Review not found" });
    }

    // Clean up the Cloudinary image too, if one was attached.
    // Older reviews created before photoPublicId existed won't have this — skip safely.
    if (review.photoPublicId) {
      try {
        await cloudinary.uploader.destroy(review.photoPublicId);
      } catch (cloudErr) {
        console.error("Cloudinary cleanup failed:", cloudErr.message);
        // don't block the DB delete just because Cloudinary cleanup failed
      }
    }

    await Review.findByIdAndDelete(req.params.id);
    res.json({ message: "Review deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};