// A booking = a customer paying the ShopSquare consultation/booking fee.
// After this, ShopSquare unlocks the provider's contact details for the customer.
// The main service payment (₦20,000 etc.) happens DIRECTLY between provider and customer.

const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
  {
    // Which service was booked
    service: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Service",
      required: true,
    },

    // --- Customer Info (captured at booking) ---
    customer_name: {
      type: String,
      required: [true, "Customer name is required"],
      trim: true,
    },
    customer_email: {
      type: String,
      required: [true, "Customer email is required"],
      trim: true,
      lowercase: true,
    },
    customer_phone: {
      type: String,
      required: [true, "Customer phone number is required"],
      trim: true,
    },
    customer_address: {
      type: String,
      trim: true,
      default: "",
    },
    // Any additional notes or requirements from the customer
    notes: {
      type: String,
      trim: true,
      default: "",
    },

    // --- ShopSquare Booking Fee ---
    booking_fee_amount: {
      type: Number,
      required: true,
    },
    // Which rail the customer used to pay the booking fee
    payment_method: {
      type: String,
      enum: ["paystack", "wallet", "crypto"],
      default: "paystack",
    },
    // Only relevant when payment_method === "crypto"
    crypto_currency: {
      type: String,
      default: "",
    },
    // Payment reference from your payment gateway (Paystack, crypto processor, etc.)
    payment_reference: {
      type: String,
      trim: true,
      default: "",
    },
    payment_status: {
      type: String,
      enum: ["pending", "paid", "failed", "refunded"],
      default: "pending",
    },
    payment_channel: {
      type: String,
      default: "", // e.g. "card", "bank_transfer", "ussd", "wallet"
    },

    // --- Booking Lifecycle ---
    // pending    → waiting for payment
    // confirmed  → payment verified, provider contact unlocked
    // in_progress→ provider has contacted the customer
    // completed  → service fully delivered
    // cancelled  → cancelled before service delivery
    status: {
      type: String,
      enum: ["pending", "confirmed", "in_progress", "completed", "cancelled"],
      default: "pending",
    },

    // Snapshot of provider name at time of booking (in case service is later edited)
    provider_name_snapshot: {
      type: String,
      default: "",
    },
    // Snapshot of the service price the customer will pay the provider directly
    service_price_snapshot: {
      type: Number,
      default: 0,
    },

    // When ShopSquare unlocked/forwarded provider contact to the customer
    forwarded_to_provider_at: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Booking", bookingSchema);