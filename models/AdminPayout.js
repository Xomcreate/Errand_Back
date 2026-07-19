import mongoose from "mongoose";

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN PAYOUT — a ledger of admin cashouts of platform profit.
// Platform profit = commission earned from vendor sales + revenue from
// platform's own item sales (partyKey === "__platform__" in Order.partyPayouts).
// This model just records withdrawals against that pool; it does NOT store
// the profit itself — profit is computed live from Order.partyPayouts.
// ─────────────────────────────────────────────────────────────────────────────
const adminPayoutSchema = new mongoose.Schema(
  {
    amount: {
      type: Number,
      required: true,
    },
    accountNumber: { type: String, required: true },
    accountName:   { type: String, required: true },
    bankCode:      { type: String, required: true },
    bankName:      { type: String },

    recipientCode: { type: String }, // Paystack transferrecipient code
    transferCode:  { type: String }, // Paystack transfer code
    reference:     { type: String, unique: true, sparse: true },

    status: {
      type: String,
      enum: ["pending", "success", "failed", "reversed"],
      default: "pending",
    },

    failureReason: { type: String, default: "" },

    // who triggered this cashout
    initiatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model("AdminPayout", adminPayoutSchema);