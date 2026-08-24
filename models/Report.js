import mongoose from "mongoose";

const reportSchema = new mongoose.Schema(
  {
    productLink: { type: String, required: true },
    reportReason: { type: String, required: true },
    details: { type: String, required: true },
    contactEmail: { type: String, default: null },
    status: {
      type: String,
      enum: ["New", "In Progress", "Resolved", "Dismissed"],
      default: "New",
    },
  },
  { timestamps: true }
);

export default mongoose.model("Report", reportSchema);