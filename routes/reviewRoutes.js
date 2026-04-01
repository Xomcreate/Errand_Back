const express = require("express");
const router = express.Router();
const reviewController = require("../controllers/reviewController");
const multer = require("multer");
const path = require("path");

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) =>
    cb(null, Date.now() + path.extname(file.originalname)),
});

const upload = multer({ storage });

// PUBLIC
router.get("/", reviewController.getReviews);
router.post("/", upload.single("photo"), reviewController.createReview);

// ADMIN
router.get("/admin", reviewController.getAllReviews);
router.patch("/approve/:id", reviewController.approveReview);
router.patch("/disapprove/:id", reviewController.disapproveReview);

module.exports = router;
