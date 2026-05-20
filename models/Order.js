import mongoose from "mongoose";

const orderSchema = new mongoose.Schema(
  {
    user: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "User",
      required: true,
    },

    items: [
      {
        productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
        quantity:  { type: Number, required: true },
        price:     { type: Number, required: true },
        vendorId:  { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        // Denormalized at order time so reports are accurate even if product is later deleted
        productName: { type: String, default: null },
        storeName:   { type: String, default: null },
        vendorName:  { type: String, default: null },
      },
    ],

    totalAmount:      { type: Number, required: true },

    status: {
      type:    String,
      enum:    ["pending", "paid", "processing", "shipped", "delivered", "failed", "cancelled"],
      default: "pending",
    },

    paymentStatus:    { type: String, enum: ["pending", "paid", "failed"], default: "pending" },
    paymentMethod:    { type: String, default: null },
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

    vendorShipPhoto:      { type: String, default: null },
    customerReceivePhoto: { type: String, default: null },

    partyShipments: [
      {
        partyKey:  { type: String, required: true },
        vendorId:  { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        photo:     { type: String, default: null },
        shippedAt: { type: Date,   default: null },
      },
    ],

    partyConfirmations: [
      {
        partyKey:    { type: String, required: true },
        vendorId:    { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        photo:       { type: String, default: null },
        confirmedAt: { type: Date,   default: null },
      },
    ],

    partyPayouts: [
      {
        partyKey:         { type: String, required: true },
        vendorId:         { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        paidAt:           { type: Date,   default: null },
        note:             { type: String, default: null },

        // Bank details stored at payout time (platform payouts entered manually by admin)
        accountNumber:    { type: String, default: null },
        accountName:      { type: String, default: null },   // ← FIX: was missing from schema
        bankCode:         { type: String, default: null },   // ← FIX: was missing from schema
        bankName:         { type: String, default: null },   // ← FIX: was missing from schema

        // Commission breakdown snapshot — stored permanently at payout time
        vendorPlan:       { type: String, default: "basic" },
        baseRate:         { type: Number, default: 0 },
        planMultiplier:   { type: Number, default: 1 },
        effectiveRate:    { type: Number, default: 0 },
        gross:            { type: Number, default: 0 },
        commissionAmount: { type: Number, default: 0 },
        net:              { type: Number, default: 0 },
      },
    ],

    escrowStatus: {
      type:    String,
      enum:    ["holding", "pending_release", "released", "refunded"],
      default: "holding",
    },

    dispute: {
      raised:   { type: Boolean, default: false },
      reason:   { type: String,  default: null  },
      resolved: { type: Boolean, default: false },
    },

    vendorShippedAt:     { type: Date,   default: null },
    customerConfirmedAt: { type: Date,   default: null },
    vendorPaidAt:        { type: Date,   default: null },
    payoutNote:          { type: String, default: null },
  },
  { timestamps: true }
);

export default mongoose.model("Order", orderSchema);