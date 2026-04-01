import express from "express";
import {
  submitInquiry,
  getAllInquiries,
  deleteInquiry,
  markContacted,
  replyInquiry,
} from "../controllers/sellerInquiryController.js";
import { upload } from "../middleware/upload.js";

const router = express.Router();

// Create new inquiry
router.post("/inquiry", upload.single("file"), submitInquiry);

// Get all inquiries (admin)
router.get("/admin", getAllInquiries);

// Delete inquiry
router.delete("/:id", deleteInquiry);

// Mark as contacted
router.patch("/contacted/:id", markContacted);

// Reply via email
router.post("/reply/:id", replyInquiry);

export default router;
