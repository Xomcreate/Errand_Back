const express = require("express");
const router = express.Router();
const reviewController = require("../controllers/reviewController");
const multer = require("multer");

// Memory storage — we need the raw buffer to stream straight to
// Cloudinary, we don't want to save anything to local disk.
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB cap, adjust as needed
});

// PUBLIC
router.get("/", reviewController.getReviews);
router.post("/", upload.single("photo"), reviewController.createReview);

// ADMIN
router.get("/admin", reviewController.getAllReviews);
router.patch("/approve/:id", reviewController.approveReview);
router.patch("/disapprove/:id", reviewController.disapproveReview);

module.exports = router;