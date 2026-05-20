import mongoose from "mongoose";

const vendorProductSchema = new mongoose.Schema(
  {
    vendorId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "User",
      required: true,
    },
    name: {
      type:     String,
      required: true,
    },
    category: {
      type:     String,
      required: true,
    },
    price: {
      type:     Number,
      required: true,
    },
    stock: {
      type:    Number,
      default: 0,
    },
    image: {
      type: String,
    },
    published: {
      type:    Boolean,
      default: true,
    },
    // Reflects vendor's verified status at time of listing
    isVerifiedListing: {
      type:    Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

export default mongoose.model("VendorProduct", vendorProductSchema);