import mongoose from "mongoose";

const referralSchema = mongoose.Schema(
  {
    referrer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    refereeEmail: { type: String, required: true },
    status: { type: String, enum: ["Clicked", "Pending Payout", "Converted"], default: "Clicked" },
    reward: { type: Number, default: 0 },
    payoutProcessed: { type: Boolean, default: false },
    date: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const Referral = mongoose.model("Referral", referralSchema);
export default Referral;