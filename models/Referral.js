import mongoose from "mongoose";

// ─────────────────────────────────────────────────────────────────────────────
// REFERRAL MODEL
// One record per referred user. referee index is unique — a user can only
// ever be referred once. This also prevents double-rewarding.
// ─────────────────────────────────────────────────────────────────────────────
const referralSchema = new mongoose.Schema(
  {
    // The user who shared their referral link
    referrer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // The new user who signed up via the referral link
    referee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    refereeEmail: {
      type: String,
      required: true,
    },

    // The qualifying first order placed by the referee
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
    },

    // Cashback credited to the REFERRER (tier-based: 5 / 7 / 10 %)
    referrerReward: {
      type: Number,
      default: 0,
    },

    // Cashback credited to the NEW USER (flat 5% on their first order)
    refereeReward: {
      type: Number,
      default: 0,
    },

    // Combined reward shown in admin dashboard (= referrerReward, for compat)
    reward: {
      type: Number,
      default: 0,
    },

    // Which cashback % tier was applied (5, 7, or 10)
    tierApplied: {
      type: Number,
      default: 5,
    },

    // Clicked        = link clicked / account created, no qualifying order yet
    // Converted      = qualifying order delivered, rewards credited to wallets
    // Pending Payout = kept for admin dashboard compatibility (manual override)
    // Paid           = admin manually marked as paid
    status: {
      type: String,
      enum: ["Clicked", "Converted", "Pending Payout", "Paid"],
      default: "Clicked",
    },

    referrerCredited: { type: Boolean, default: false },
    refereeCredited:  { type: Boolean, default: false },
  },
  { timestamps: true }
);

// A user can only be a referee ONCE — prevents double-rewarding
referralSchema.index({ referee: 1 }, { unique: true });

export default mongoose.model("Referral", referralSchema);