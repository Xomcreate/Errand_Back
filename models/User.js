import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ["buyer", "vendor", "admin"], required: true },
    name: { type: String, required: true, trim: true },
    storeName: { type: String, required: function () { return this.role === "vendor"; } },
    email: { type: String, required: true, unique: true, lowercase: true },
    phone: { type: String, required: true },
    address: { type: String, required: function () { return this.role === "vendor"; } },

    categories: {
      type: [String],
      default: ["General"],
      required: function () { return this.role === "vendor"; },
    },

    bankDetails: {
      accountNumber: { type: String, default: "" },
      bankCode:      { type: String, default: "" },
      accountName:   { type: String, default: "" },
      recipientCode: { type: String, default: "" },
    },

    description: { type: String, default: "" },

    password: { type: String, required: true, minlength: 8 },

    businessHours: {
      monday:    { open: String, close: String },
      tuesday:   { open: String, close: String },
      wednesday: { open: String, close: String },
      thursday:  { open: String, close: String },
      friday:    { open: String, close: String },
      saturday:  { open: String, close: String },
      sunday:    { open: String, close: String },
    },

    profileImage: { type: String, default: "" },

    status:     { type: String, enum: ["Active", "Blocked"], default: "Active" },
    isVerified: { type: Boolean, default: false },

    // ── Wallet ──────────────────────────────────────────────────────────────
    // FIX: was missing — $inc on an undefined field returns undefined in the
    // populated document, causing balanceAfter: null in WalletTransaction and
    // the wallet UI showing ₦0.00 even after a successful credit.
    walletBalance: { type: Number, default: 0 },

    // ── Referral ─────────────────────────────────────────────────────────────
    // FIX: was missing — getMyReferralLink falls back to user._id if this is
    // absent, but having it as a proper field allows custom codes and indexing.
    referralCode: { type: String, default: "" },
  },
  { timestamps: true }
);

// Hash password before saving
userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 12);
});

export default mongoose.model("User", userSchema);