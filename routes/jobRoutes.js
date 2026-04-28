import express from "express";
import {
  createJob,
  getJobs,
  updateJob,
  deleteJob,
  applyJob,
} from "../controllers/jobController.js";

import { upload } from "../middleware/upload.js";

const router = express.Router();

// CREATE
router.post("/", createJob);

// GET ALL
router.get("/", getJobs);

// UPDATE
router.put("/:id", updateJob);

// DELETE
router.delete("/:id", deleteJob);

router.post("/apply", upload.single("cv"), applyJob);


export default router;