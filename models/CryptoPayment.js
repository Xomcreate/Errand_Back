// models/CryptoPayment.js
import mongoose from "mongoose";

const cryptoPaymentSchema = new mongoose.Schema(
  {
    // ── Polymorphic target: either an Order or a Booking ─────────────────
    targetType: {
      type: String,
      enum: ["order", "booking"],
      required: true,
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
      // refPath lets .populate("targetId") resolve to the right model
      refPath: "targetModel",
    },
    targetModel: {
      type: String,
      required: true,
      enum: ["Order", "Booking"],
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    currency: {
      type: String, // btc, eth, usdt, usdc, bnb, sol, ltc, trx, doge, xrp
      required: true,
    },

    // ── NOWPayments identifiers ──────────────────────────────────────────
    // The payment_id NOWPayments returns from "Create Payment" — this is
    // what ties an IPN webhook back to this row. Unique per attempt.
    nowPaymentId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    // orderId we sent NOWPayments — useful for cross-checking in the dashboard
    nowOrderId: {
      type: String,
      required: true,
    },

    // ── Deposit details — generated fresh per payment, never reused ─────
    payAddress: {
      type: String,
      required: true,
    },
    payAmount: {
      type: Number, // amount in crypto the user is asked to send
      required: true,
    },
    priceAmountNGN: {
      type: Number, // the NGN value (order total or booking fee) this payment was created for
      required: true,
    },

    // Mirrors NOWPayments' own status machine so you don't need to
    // re-derive it: waiting -> confirming -> confirmed -> finished
    // (or failed / expired / refunded / partially_paid)
    status: {
      type: String,
      enum: [
        "waiting",
        "confirming",
        "confirmed",
        "sending",
        "finished",
        "partially_paid",
        "failed",
        "refunded",
        "expired",
      ],
      default: "waiting",
    },

    // Populated once NOWPayments actually reports what arrived on-chain —
    // this is what you compare against payAmount, never trust the amount
    // you originally quoted.
    actuallyPaid: Number,
    outcomeAmount: Number,
    outcomeCurrency: String,

    expiresAt: Date,
  },
  { timestamps: true }
);

export default mongoose.model("CryptoPayment", cryptoPaymentSchema);