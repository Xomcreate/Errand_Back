import mongoose from "mongoose";

const jobSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    location: { type: String, required: true },
    type: {
      type: String,
      enum: ["Full-Time", "Part-Time", "Remote", "Contract"],
      default: "Full-Time",
    },

    email: { type: String, required: true }, // employer email

    applicants: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Job", jobSchema);