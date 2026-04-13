import mongoose from "mongoose";

const ProductSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String },
    brand: { type: String, required: true },

    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },

    image: { type: String },

    price: { type: Number, required: true },
    oldPrice: { type: Number },

    isFlashSale: { type: Boolean, default: false },
    isDealOfTheDay: { type: Boolean, default: false },
    isTrending: { type: Boolean, default: false },

    dealPrice: { type: Number },
    dealEnds: { type: Date },
  },
  { timestamps: true }
);

export default mongoose.model("Product", ProductSchema);