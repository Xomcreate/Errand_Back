// models/Payment.js
import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema({
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Order",
    required: true,
  },

  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },

  reference: String,

  amount: Number,

  status: {
    type: String,
    enum: ["success", "failed", "pending"],
    default: "pending",
  },

  type: {
    type: String,
    enum: ["sale", "refund"],
    default: "sale",
  },

  gateway: {
    type: String,
    default: "paystack",
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model("Payment", paymentSchema);