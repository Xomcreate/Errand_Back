import mongoose from "mongoose";

const SellerInquirySchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: String,
    category: { type: String, required: true },
    description: { type: String, required: true },
    fileUrl: String,       // secure_url returned by Cloudinary
    filePublicId: String,  // needed to delete the file from Cloudinary later
    status: { type: String, enum: ["Pending", "Contacted"], default: "Pending" },
  },
  { timestamps: true }
);

export default mongoose.model("SellerInquiry", SellerInquirySchema);