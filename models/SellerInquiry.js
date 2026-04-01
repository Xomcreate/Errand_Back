import mongoose from "mongoose";

const SellerInquirySchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: String,
    category: { type: String, required: true },
    description: { type: String, required: true },
    filePath: String,
    status: { type: String, enum: ["Pending", "Contacted"], default: "Pending" },
  },
  { timestamps: true }
);

export default mongoose.model("SellerInquiry", SellerInquirySchema);
