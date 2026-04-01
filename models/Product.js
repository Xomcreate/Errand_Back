const mongoose = require("mongoose");

const ProductSchema = new mongoose.Schema({
  name: { type: String, required: true },
  vendor: { type: String, required: true },
  category: { type: mongoose.Schema.Types.ObjectId, ref: "Category", required: true },
  image: { type: String, default: null },
  status: { type: String, enum: ["Pending", "Approved", "Rejected"], default: "Pending" },
  isFeatured: { type: Boolean, default: false },
  reason: { type: String, default: null },
}, { timestamps: true });

module.exports = mongoose.model("Product", ProductSchema);