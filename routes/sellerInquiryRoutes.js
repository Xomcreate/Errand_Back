import express from "express";
import {
  submitInquiry,
  getAllInquiries,
  deleteInquiry,
  deleteAllInquiries,
  markContacted,
  replyInquiry,
} from "../controllers/sellerInquiryController.js";
import { upload } from "../middleware/upload.js";

const router = express.Router();

router.post("/inquiry", upload.single("file"), submitInquiry);
router.get("/admin", getAllInquiries);
router.delete("/admin/all", deleteAllInquiries);
router.delete("/:id", deleteInquiry);
router.patch("/contacted/:id", markContacted);
router.post("/reply/:id", replyInquiry);

export default router;