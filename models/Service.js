import mongoose from "mongoose";

const serviceSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Service title is required"],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    provider_name: {
      type: String,
      trim: true,
      default: "",
    },
    // What the customer pays the provider directly (0 = negotiable)
    price: {
      type: Number,
      required: [true, "Service price is required"],
      min: [0, "Price cannot be negative"],
    },
    image_url: {
      type: String,
      default: "",
    },
    category: {
      type: String,
      trim: true,
      default: "Services",
    },

    // ── Provider Contact (only released to customer after booking fee is paid) ──
    provider_contact: {
      phone:    { type: String, trim: true, default: "" },
      email:    { type: String, trim: true, default: "" },
      whatsapp: { type: String, trim: true, default: "" },
      address:  { type: String, trim: true, default: "" },
    },

    // ── ShopSquare Revenue ────────────────────────────────────────────────────
    listing_fee_paid: {
      type: Number,
      default: 0,
    },
    listing_type: {
      type: String,
      enum: ["standard", "featured", "premium"],
      default: "standard",
    },
    // Booking/consultation fee ShopSquare charges per booking
    booking_fee: {
      type: Number,
      required: true,
      default: 500,
    },
    // Running total of booking fees earned on this service
    booking_fee_earned: {
      type: Number,
      default: 0,
    },

    // ── Listing Lifecycle ─────────────────────────────────────────────────────
    status: {
      type: String,
      enum: ["pending", "active", "rejected", "expired"],
      default: "pending",
    },
    // How many days the listing stays active once approved/activated
    listing_duration_days: {
      type: Number,
      enum: [10, 15, 30, 60, 90],
      default: 30,
    },
    listing_expires_at: {
      type: Date,
      default: null,
    },
    total_bookings: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

// Virtual: total ShopSquare revenue (listing fee + all booking fees)
serviceSchema.virtual("total_revenue_earned").get(function () {
  return this.listing_fee_paid + this.booking_fee_earned;
});

serviceSchema.set("toJSON",   { virtuals: true });
serviceSchema.set("toObject", { virtuals: true });

// Auto-set expiry (based on listing_duration_days) when a listing first goes active.
// If duration is changed later while already active, recompute from today.
serviceSchema.pre("save", async function () {
  if (this.isModified("status") && this.status === "active" && !this.listing_expires_at) {
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + (this.listing_duration_days || 30));
    this.listing_expires_at = expiry;
  }

  if (this.isModified("listing_duration_days") && this.status === "active" && !this.isModified("status")) {
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + (this.listing_duration_days || 30));
    this.listing_expires_at = expiry;
  }
});

export default mongoose.model("Service", serviceSchema);