import mongoose from "mongoose";

// ─────────────────────────────────────────────────────────────────────────────
// WALLET TRANSACTION MODEL
// Every credit or debit to a user's wallet creates one record here.
// This powers the transaction history table in the Wallet UI.
// ─────────────────────────────────────────────────────────────────────────────
const walletTransactionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // "credit" = money coming in | "debit" = money going out (only via order payment)
    type: {
      type: String,
      enum: ["credit", "debit"],
      required: true,
    },

    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    // Human-readable label shown in transaction history
    description: {
      type: String,
      required: true,
    },

    // What caused this transaction. No "withdrawal" — wallet is platform-only.
    source: {
      type: String,
      enum: [
        "referral_cashback",  // referrer earned tier cashback
        "welcome_cashback",   // new user earned 5% on their first order
        "order_payment",      // wallet spent to pay for an order
        "refund",             // order refund credited back to wallet
        "admin_adjustment",   // manual admin credit
      ],
      required: true,
    },

    // Link to the order that triggered this transaction (if any)
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
    },

    // Link to the referral that triggered this transaction (if any)
    referralId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Referral",
      default: null,
    },

    // Wallet balance snapshot AFTER this transaction — shown in history table
    balanceAfter: {
      type: Number,
      default: null,
    },

    status: {
      type: String,
      enum: ["Completed", "Processing", "Failed"],
      default: "Completed",
    },
  },
  { timestamps: true }
);

export default mongoose.model("WalletTransaction", walletTransactionSchema);