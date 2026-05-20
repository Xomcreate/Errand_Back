const mongoose = require("mongoose");

const referralSchema = new mongoose.Schema({
  referrerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },

  refereeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },

  refereeEmail: {
    type: String,
    required: true,
  },

  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Order",
  },

  reward: {
    type: Number,
    default: 0,
  },

  status: {
    type: String,
    enum: ["Clicked", "Converted", "Pending Payout", "Paid"],
    default: "Clicked",
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Referral", referralSchema);