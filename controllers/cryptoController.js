// controllers/cryptoController.js
import crypto from "crypto";
import CryptoPayment from "../models/CryptoPayment.js";
import Order from "../models/Order.js";
import Booking from "../models/Booking.js";
import Service from "../models/Service.js";

const NOWPAYMENTS_API_URL = "https://api.nowpayments.io/v1";
const NOWPAYMENTS_API_KEY = process.env.NOWPAYMENTS_API_KEY;
const NOWPAYMENTS_IPN_SECRET = process.env.NOWPAYMENTS_IPN_SECRET;
const IPN_CALLBACK_URL = process.env.NOWPAYMENTS_IPN_CALLBACK_URL; // e.g. https://yourdomain.com/api/payments/crypto/ipn

// Statuses that mean "money has actually settled" — only these should
// unlock goods/services. "confirmed" still means NOWPayments is in the
// middle of converting/settling; amounts can still move at that stage.
const SETTLED_STATUSES = ["finished"];

// ─────────────────────────────────────────────
// FIX: NOWPayments requires network-qualified codes for multi-chain
// assets. Sending plain "usdt", "usdc", or "bnb" as pay_currency gets
// rejected by their API (this was silently failing initCryptoPayment
// for those three coins while btc/eth/sol/ltc/trx/doge/xrp worked fine,
// since those are single-chain and their plain ticker is valid).
//
// The frontend COIN_INFO keys (btc, eth, usdt, usdc, bnb, sol, ltc,
// trx, doge, xrp, ton) don't need to change — this map translates the
// internal key to whatever NOWPayments actually expects as
// `pay_currency`. Defaults below pick one network per coin (cheapest/
// most common); swap these if you want a different default network,
// or extend to let the user choose a network per coin.
//
// "ton" — Toncoin, native TON blockchain. This is what's commonly
// referred to as "Gram" (the original Telegram/TON token that was
// cancelled pre-launch and never issued; TON is its successor).
// ─────────────────────────────────────────────
const NOWPAYMENTS_CURRENCY_MAP = {
  btc: "btc",
  eth: "eth",
  usdt: "usdttrc20", // TRC20 — lowest fees; use "usdterc20" / "usdtbsc" if you'd rather default elsewhere
  usdc: "usdcerc20", // use "usdcbsc" / "usdcmatic" if you'd rather default elsewhere
  bnb: "bnbbsc",
  sol: "sol",
  ltc: "ltc",
  trx: "trx",
  doge: "doge",
  xrp: "xrp",
  ton: "ton", // NEW — Toncoin ("Gram")
};

// ─────────────────────────────────────────────
// SHARED: create (or reuse) a NOWPayments payment for any target type
// ─────────────────────────────────────────────
async function createCryptoPayment({
  targetType,
  targetModel,
  targetId,
  userId,
  currency,
  amountNGN,
  description,
}) {
  const internalCurrency = currency.toLowerCase();
  const nowPayCurrency = NOWPAYMENTS_CURRENCY_MAP[internalCurrency];

  if (!nowPayCurrency) {
    const err = new Error(`Unsupported currency: ${currency}`);
    err.status = 400;
    throw err;
  }

  // Reuse a still-open payment attempt for this target+coin instead of
  // spawning a new deposit address every time the tab is reopened.
  // Keyed off the internal currency (what the frontend/DB use), not the
  // NOWPayments network code.
  const existing = await CryptoPayment.findOne({
    targetType,
    targetId,
    currency: internalCurrency,
    status: { $in: ["waiting", "confirming"] },
  });
  if (existing) return { payment: existing, created: false };

  const nowOrderId = `${targetType}-${targetId}-${Date.now()}`;

  const nowRes = await fetch(`${NOWPAYMENTS_API_URL}/payment`, {
    method: "POST",
    headers: {
      "x-api-key": NOWPAYMENTS_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      price_amount: amountNGN,
      price_currency: "ngn",
      pay_currency: nowPayCurrency,
      order_id: nowOrderId,
      order_description: description,
      ipn_callback_url: IPN_CALLBACK_URL,
    }),
  });

  if (!nowRes.ok) {
    const errBody = await nowRes.text();
    console.error("NOWPayments create payment failed:", nowRes.status, errBody);
    throw new Error("Could not initialize crypto payment");
  }

  const data = await nowRes.json();
  // data: { payment_id, pay_address, pay_amount, pay_currency,
  //          price_amount, price_currency, payment_status, ... }

  const payment = await CryptoPayment.create({
    targetType,
    targetModel,
    targetId,
    ...(userId ? { user: userId } : {}), // omitted entirely for guest bookings
    currency: internalCurrency,
    currencyNetwork: nowPayCurrency, // NEW — record exactly which NOWPayments code was used
    nowPaymentId: String(data.payment_id),
    nowOrderId,
    payAddress: data.pay_address,
    payAmount: data.pay_amount,
    priceAmountNGN: amountNGN,
    status: data.payment_status || "waiting",
  });

  return { payment, created: true };
}

// ─────────────────────────────────────────────
// ORDER CHECKOUT — POST /payments/crypto/init
// body: { orderId, currency }
// ─────────────────────────────────────────────
export const initCryptoPayment = async (req, res) => {
  try {
    const { orderId, currency } = req.body;
    if (!orderId || !currency) {
      return res.status(400).json({ message: "orderId and currency are required" });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }
    if (order.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized for this order" });
    }
    if (order.isPaid) {
      return res.status(400).json({ message: "Order is already paid" });
    }

    const { payment, created } = await createCryptoPayment({
      targetType: "order",
      targetModel: "Order",
      targetId: order._id,
      userId: req.user._id,
      currency,
      amountNGN: order.totalAmount,
      description: `Order ${order._id}`,
    });

    return res.status(created ? 201 : 200).json(payment);
  } catch (err) {
    console.error("initCryptoPayment error:", err.message);
    return res.status(err.status || 500).json({ message: err.status ? err.message : "Could not initialize crypto payment" });
  }
};

// ─────────────────────────────────────────────
// SERVICE BOOKINGS — called from bookingController.payBookingWithCrypto
// (not a route itself; bookingController owns auth/ownership checks and
// booking-fee lookup, then delegates payment creation here)
// ─────────────────────────────────────────────
export async function initCryptoPaymentForBooking({ booking, userId, currency }) {
  return createCryptoPayment({
    targetType: "booking",
    targetModel: "Booking",
    targetId: booking._id,
    userId,
    currency,
    amountNGN: booking.booking_fee_amount,
    description: `Booking fee — ${booking._id}`,
  });
}

// ─────────────────────────────────────────────
// GET /payments/crypto/:id/status
// Local read of our own record — cheap polling target for the frontend.
// The IPN webhook is the source of truth; this just reflects it, but we
// also fall back to asking NOWPayments directly if we haven't heard
// anything in a while (covers a missed webhook). Works for both orders
// and bookings since it's keyed off the CryptoPayment record, not the
// target.
// ─────────────────────────────────────────────
export const getCryptoPaymentStatus = async (req, res) => {
  try {
    const payment = await CryptoPayment.findById(req.params.id);
    if (!payment) {
      return res.status(404).json({ message: "Payment not found" });
    }
    // Order payments always have a user — enforce ownership. Booking
    // payments are guest checkout and have no user at all, so there's
    // nothing to check; the unguessable payment _id is the access control.
    if (payment.user && (!req.user || payment.user.toString() !== req.user._id.toString())) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const staleForOverAMinute =
      Date.now() - payment.updatedAt.getTime() > 60 * 1000;

    if (!SETTLED_STATUSES.includes(payment.status) && staleForOverAMinute) {
      const nowRes = await fetch(
        `${NOWPAYMENTS_API_URL}/payment/${payment.nowPaymentId}`,
        { headers: { "x-api-key": NOWPAYMENTS_API_KEY } }
      );
      if (nowRes.ok) {
        const data = await nowRes.json();
        await applyStatusUpdate(payment, data);
      }
    }

    return res.status(200).json(payment);
  } catch (err) {
    console.error("getCryptoPaymentStatus error:", err.message);
    return res.status(500).json({ message: "Could not fetch payment status" });
  }
};

// ─────────────────────────────────────────────
// POST /payments/crypto/ipn
// NOWPayments webhook. No auth middleware — NOWPayments calls this
// directly — so the HMAC signature check below IS the authentication.
// Mount this route with a raw-body parser so req.rawBody is the exact
// bytes NOWPayments sent (signature verification breaks on re-serialized
// JSON, since key order matters).
// ─────────────────────────────────────────────
export const handleCryptoIPN = async (req, res) => {
  try {
    const signature = req.headers["x-nowpayments-sig"];
    if (!signature) {
      return res.status(400).json({ message: "Missing signature" });
    }

    const sortedBody = sortObjectKeys(req.body);
    const expectedSig = crypto
      .createHmac("sha512", NOWPAYMENTS_IPN_SECRET)
      .update(JSON.stringify(sortedBody))
      .digest("hex");

    if (expectedSig !== signature) {
      console.warn("NOWPayments IPN signature mismatch");
      return res.status(401).json({ message: "Invalid signature" });
    }

    const payment = await CryptoPayment.findOne({
      nowPaymentId: String(req.body.payment_id),
    });
    if (!payment) {
      // Ack anyway so NOWPayments stops retrying a payment we don't track
      return res.status(200).json({ received: true });
    }

    await applyStatusUpdate(payment, req.body);

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("handleCryptoIPN error:", err.message);
    // Non-200 makes NOWPayments retry — fine for transient errors
    return res.status(500).json({ message: "IPN processing error" });
  }
};

// ─────────────────────────────────────────────
// SHARED: apply a NOWPayments status payload to our record, and unlock
// whichever target (Order or Booking) it belongs to once settled.
// This is the ONLY place a booking or order gets marked paid from crypto —
// never from a client-submitted transaction hash.
// ─────────────────────────────────────────────
async function applyStatusUpdate(payment, data) {
  payment.status = data.payment_status;
  payment.actuallyPaid = data.actually_paid ?? payment.actuallyPaid;
  payment.outcomeAmount = data.outcome_amount ?? payment.outcomeAmount;
  payment.outcomeCurrency = data.outcome_currency ?? payment.outcomeCurrency;
  await payment.save();

  if (!SETTLED_STATUSES.includes(payment.status)) return;

  // Belt-and-braces: don't unlock anything unless what actually arrived
  // covers what we quoted. Guards against "partially_paid" edge cases
  // slipping through if NOWPayments' status ever lags the amount.
  const coveredFully =
    !payment.actuallyPaid || payment.actuallyPaid >= payment.payAmount * 0.995; // 0.5% tolerance

  if (!coveredFully) return;

  if (payment.targetType === "order") {
    await Order.findByIdAndUpdate(payment.targetId, {
      isPaid: true,
      paidAt: new Date(),
      paymentMethod: "crypto",
    });
  } else if (payment.targetType === "booking") {
    const booking = await Booking.findById(payment.targetId);
    if (!booking || booking.payment_status === "paid") return;

    booking.payment_status = "paid";
    booking.payment_method = "crypto";
    booking.payment_channel = "crypto";
    booking.payment_reference = payment.nowPaymentId;
    booking.status = "confirmed";
    booking.forwarded_to_provider_at = new Date();
    await booking.save();

    await Service.findByIdAndUpdate(booking.service, {
      $inc: { booking_fee_earned: booking.booking_fee_amount, total_bookings: 1 },
    });
  }
}

function sortObjectKeys(obj) {
  if (Array.isArray(obj)) return obj.map(sortObjectKeys);
  if (obj !== null && typeof obj === "object") {
    return Object.keys(obj)
      .sort()
      .reduce((acc, key) => {
        acc[key] = sortObjectKeys(obj[key]);
        return acc;
      }, {});
  }
  return obj;
}