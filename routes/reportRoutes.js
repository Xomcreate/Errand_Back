import express from "express";
import {
  createReport,
  getReports,
  updateReportStatus,
  deleteReport,
} from "../controllers/reportController.js";

const router = express.Router();

router.post("/", createReport);       // public — from Report.jsx
router.get("/", getReports);          // admin — fetch all reports
router.put("/:id/status", updateReportStatus); // admin — update status
router.delete("/:id", deleteReport);  // admin — delete

export default router;