import mongoose from "mongoose";

const vendorPlanSchema = new mongoose.Schema(
  {
    vendorId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "User",
      required: true,
      unique:   true,
    },
    plan: {
      type:    String,
      enum:    ["basic", "silver", "gold"],
      default: "basic",
    },
    isVerified: {
      type:    Boolean,
      default: false,
    },
    productLimit: {
      type:    Number,
      default: 5,
    },
    paystackReference: {
      type:    String,
      default: null,
    },
    planExpiresAt: {
      type:    Date,
      default: null,
    },
  },
  { timestamps: true }
);

export default mongoose.model("VendorPlan", vendorPlanSchema);