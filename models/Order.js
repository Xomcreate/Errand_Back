import mongoose from "mongoose";

const orderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    items: [
      {
        productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
        quantity:  { type: Number, required: true },
        price:     { type: Number, required: true },
        vendorId:  { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      },
    ],

    totalAmount:      { type: Number, required: true },

    status: {
      type: String,
      enum: ["pending", "paid", "processing", "shipped", "delivered", "failed", "cancelled"],
      default: "pending",
    },

    paymentStatus:    { type: String, enum: ["pending", "paid", "failed"], default: "pending" },
    paymentMethod:    { type: String, enum: ["paystack"], default: null },
    paymentReference: { type: String, default: null },

    deliveryInfo: {
      fullName: String,
      phone:    String,
      country:  String,
      state:    String,
      city:     String,
      street:   String,
      landmark: String,
    },

    // ── SHIPPING PROOF (top-level — backward compat, first ship photo) ────────
    vendorShipPhoto:      { type: String, default: null },
    customerReceivePhoto: { type: String, default: null },

    // ── PER-PARTY SHIPMENT TRACKING ───────────────────────────────────────────
    // partyKey: "__platform__" for platform items, or vendorId string for vendor items
    partyShipments: [
      {
        partyKey:  { type: String, required: true },
        vendorId:  { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        photo:     { type: String, default: null },
        shippedAt: { type: Date, default: null },
      },
    ],

    // ── PER-PARTY DELIVERY CONFIRMATION ──────────────────────────────────────
    // One record per party once the customer confirms receipt of THAT party's items.
    // partyKey: "__platform__" | vendorId string
    partyConfirmations: [
      {
        partyKey:    { type: String, required: true },
        vendorId:    { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        photo:       { type: String, default: null }, // customer's received photo for this party
        confirmedAt: { type: Date, default: null },
      },
    ],

    // ── PER-PARTY PAYOUT TRACKING ─────────────────────────────────────────────
    partyPayouts: [
      {
        partyKey:      { type: String, required: true },
        vendorId:      { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        paidAt:        { type: Date, default: null },
        note:          { type: String, default: null },
        accountNumber: { type: String, default: null }, // platform payouts only
      },
    ],

    // ── ESCROW ────────────────────────────────────────────────────────────────
    escrowStatus: {
      type: String,
      enum: ["holding", "pending_release", "released", "refunded"],
      default: "holding",
    },

    // ── DISPUTE ───────────────────────────────────────────────────────────────
    dispute: {
      raised:   { type: Boolean, default: false },
      reason:   { type: String,  default: null  },
      resolved: { type: Boolean, default: false },
    },

    vendorShippedAt:     { type: Date, default: null },
    customerConfirmedAt: { type: Date, default: null }, // set when ALL parties confirmed
    vendorPaidAt:        { type: Date, default: null },
    payoutNote:          { type: String, default: null },
  },
  { timestamps: true }
);

export default mongoose.model("Order", orderSchema);