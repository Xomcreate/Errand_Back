// models/Application.js
import mongoose from "mongoose";

const applicationSchema = new mongoose.Schema(
  {
    jobId: String,
    fullName: String,
    email: String,
    phone: String,
    cvFile: String,
    coverLetter: String,
  },
  { timestamps: true }
);

export default mongoose.model("Application", applicationSchema);