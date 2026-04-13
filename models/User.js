import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ["buyer", "vendor"], required: true },
    name: { type: String, required: true, trim: true },
    storeName: { type: String, required: function () { return this.role === "vendor"; } },
    email: { type: String, required: true, unique: true, lowercase: true },
    phone: { type: String, required: true },
    address: { type: String, required: function () { return this.role === "vendor"; } },
    password: { type: String, required: true, minlength: 8 },
    status: { type: String, enum: ["Active", "Blocked"], default: "Active" }, // ✅ store user status
    isVerified: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Hash password before saving
userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 12);
});

export default mongoose.model("User", userSchema);
