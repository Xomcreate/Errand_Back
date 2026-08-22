import Booking from "../models/Booking.js";
import Service from "../models/Service.js";
import User from "../models/User.js";
import { initCryptoPaymentForBooking } from "./cryptoController.js";

// ─────────────────────────────────────────────
// PUBLIC: Customer creates a booking request
// ─────────────────────────────────────────────

// POST /api/bookings
export const createBooking = async (req, res) => {
  try {
    const { service_id, customer_name, customer_email, customer_phone, customer_address, notes } =
      req.body;

    if (!service_id || !customer_name || !customer_email || !customer_phone) {
      return res.status(400).json({
        message: "service_id, customer_name, customer_email, and customer_phone are required.",
      });
    }

    const service = await Service.findOne({ _id: service_id, status: "active" });
    if (!service) {
      return res.status(404).json({ message: "This service is not currently available." });
    }

    const booking = await Booking.create({
      service:                service._id,
      customer_name,
      customer_email,
      customer_phone,
      customer_address:       customer_address || "",
      notes:                  notes || "",
      booking_fee_amount:     service.booking_fee,
      provider_name_snapshot: service.provider_name,
      service_price_snapshot: service.price,
      status:                 "pending",
      payment_status:         "pending",
    });

    res.status(201).json({
      message:          "Booking created. Choose a payment method to confirm.",
      booking_id:       booking._id,
      booking_fee:      service.booking_fee,
      payment_metadata: {
        booking_id:    booking._id.toString(),
        service_title: service.title,
        amount:        service.booking_fee,
        email:         customer_email,
      },
    });
  } catch (err) {
    console.error("createBooking:", err);
    res.status(500).json({ message: "Failed to create booking.", error: err.message });
  }
};

// ─────────────────────────────────────────────
// PAYMENT RAILS
// ─────────────────────────────────────────────

// POST /api/bookings/:id/pay/paystack
export const payBookingWithPaystack = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id).populate("service");
    if (!booking) return res.status(404).json({ message: "Booking not found." });

    if (booking.payment_status === "paid") {
      return res.json({ message: "Booking already paid.", booking });
    }

    // ── Guard: ensure secret key is configured ────────────────────────────────
    if (!process.env.PAYSTACK_SECRET_KEY) {
      console.error("payBookingWithPaystack: PAYSTACK_SECRET_KEY is missing from environment.");
      return res.status(500).json({
        message: "Payment is not configured on this server. Please contact support.",
      });
    }

    // Build callback_url — Paystack redirects here after payment.
    // We append booking_id so the frontend can recover state after the redirect.
    const frontendBase  = process.env.FRONTEND_URL || "http://localhost:5173";
    const serviceSlug   = booking.service?._id?.toString() || "";
    const callbackUrl   = `${frontendBase}/services/${serviceSlug}?booking_id=${booking._id}`;

    // Initialize transaction with Paystack
    const paystackRes = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization:  `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email:        booking.customer_email,
        amount:       booking.booking_fee_amount * 100, // convert to kobo
        callback_url: callbackUrl,                      // Paystack appends ?reference=xxx to this
        metadata: {
          booking_id:    booking._id.toString(),
          customer_name: booking.customer_name,
          service_title: booking.service?.title || "",
        },
      }),
    });

    const paystackData = await paystackRes.json();

    if (!paystackData.status) {
      return res.status(400).json({
        message: paystackData.message || "Paystack initialization failed.",
      });
    }

    // Save payment method and reference
    booking.payment_method    = "paystack";
    booking.payment_reference = paystackData.data.reference;
    await booking.save();

    // Return authorization_url — frontend redirects the user here
    res.json({
      authorization_url: paystackData.data.authorization_url,
      reference:         paystackData.data.reference,
    });
  } catch (err) {
    console.error("payBookingWithPaystack:", err);
    res.status(500).json({ message: "Failed to initialize Paystack payment.", error: err.message });
  }
};

// POST /api/bookings/:id/pay/crypto
// Delegates to cryptoController's shared NOWPayments logic so orders and
// bookings go through the exact same create/poll/IPN pipeline.
export const payBookingWithCrypto = async (req, res) => {
  try {
    const { currency } = req.body;
    if (!currency) {
      return res.status(400).json({ message: "currency is required." });
    }

    const booking = await Booking.findById(req.params.id).populate("service");
    if (!booking) return res.status(404).json({ message: "Booking not found." });
    if (booking.payment_status === "paid") {
      return res.json({ message: "Booking already paid.", booking });
    }

    booking.payment_method  = "crypto";
    booking.crypto_currency = currency;
    await booking.save();

    const { payment } = await initCryptoPaymentForBooking({
      booking,
      userId: req.user._id,
      currency,
    });

    // Shaped to match what the frontend expects (and to carry payment._id
    // so it can poll GET /payments/crypto/:id/status)
    res.json({
      _id:            payment._id,
      booking_id:     booking._id,
      currency:       payment.currency,
      amount_ngn:     payment.priceAmountNGN,
      wallet_address: payment.payAddress,
      amount_crypto:  payment.payAmount,
      reference:      payment.nowPaymentId,
    });
  } catch (err) {
    console.error("payBookingWithCrypto:", err);
    res.status(500).json({ message: "Failed to initialize crypto payment.", error: err.message });
  }
};

// POST /api/bookings/:id/pay/wallet  (requires logged-in customer)
export const payBookingWithWallet = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id).populate("service");
    if (!booking) return res.status(404).json({ message: "Booking not found." });
    if (booking.payment_status === "paid") {
      return res.json({
        message:          "Booking already paid.",
        booking,
        provider_contact: booking.service.provider_contact,
      });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(401).json({ message: "Not authorized." });

    if (user.walletBalance < booking.booking_fee_amount) {
      return res.status(400).json({
        message: `Insufficient wallet balance. You need ₦${booking.booking_fee_amount.toLocaleString()} but have ₦${user.walletBalance.toLocaleString()}.`,
      });
    }

    user.walletBalance -= booking.booking_fee_amount;
    await user.save();

    booking.payment_status           = "paid";
    booking.payment_method           = "wallet";
    booking.payment_channel          = "wallet";
    booking.status                   = "confirmed";
    booking.forwarded_to_provider_at = new Date();
    await booking.save();

    await Service.findByIdAndUpdate(booking.service._id, {
      $inc: { booking_fee_earned: booking.booking_fee_amount, total_bookings: 1 },
    });

    res.json({
      message:          "Payment successful! You now have access to the provider's contact details.",
      newBalance:       user.walletBalance,
      booking,
      provider_contact: booking.service.provider_contact,
    });
  } catch (err) {
    console.error("payBookingWithWallet:", err);
    res.status(500).json({ message: "Wallet payment failed.", error: err.message });
  }
};

// POST /api/bookings/verify-payment
// NOTE: this now only ever handles Paystack. Crypto bookings are marked
// paid exclusively by cryptoController's applyStatusUpdate(), triggered by
// the NOWPayments IPN webhook (or the status-poll fallback) — never by a
// client-submitted reference. There is intentionally no crypto branch here
// anymore: the old version fell through both the Paystack check and a
// commented-out crypto check straight to marking the booking paid, which
// meant any string typed into the "transaction hash" field would confirm
// the booking with zero on-chain verification.
export const verifyBookingPayment = async (req, res) => {
  try {
    const { booking_id, payment_reference, payment_channel } = req.body;

    if (!booking_id || !payment_reference) {
      return res.status(400).json({ message: "booking_id and payment_reference are required." });
    }

    const booking = await Booking.findById(booking_id).populate("service");
    if (!booking) return res.status(404).json({ message: "Booking not found." });

    if (booking.payment_status === "paid") {
      return res.status(200).json({
        message:          "Booking already confirmed.",
        booking,
        provider_contact: booking.service.provider_contact,
      });
    }

    if (payment_channel !== "paystack" && booking.payment_method !== "paystack") {
      return res.status(400).json({
        message: "This payment method is confirmed automatically and cannot be verified manually.",
      });
    }

    if (!process.env.PAYSTACK_SECRET_KEY) {
      return res.status(500).json({ message: "Paystack is not configured on this server." });
    }

    const paystackRes = await fetch(
      `https://api.paystack.co/transaction/verify/${payment_reference}`,
      { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
    );
    const paystackData = await paystackRes.json();

    if (!paystackData.status || paystackData.data.status !== "success") {
      return res.status(400).json({
        message: paystackData.message || "Paystack payment verification failed.",
      });
    }

    const amountPaidKobo = paystackData.data.amount;
    if (amountPaidKobo < booking.booking_fee_amount * 100) {
      return res.status(400).json({
        message: `Amount paid (₦${amountPaidKobo / 100}) does not match booking fee (₦${booking.booking_fee_amount}).`,
      });
    }

    booking.payment_status           = "paid";
    booking.payment_reference        = payment_reference;
    booking.payment_channel          = payment_channel || "paystack";
    booking.status                   = "confirmed";
    booking.forwarded_to_provider_at = new Date();
    await booking.save();

    await Service.findByIdAndUpdate(booking.service._id, {
      $inc: { booking_fee_earned: booking.booking_fee_amount, total_bookings: 1 },
    });

    res.json({
      message:          "Booking confirmed! Here's how to reach the provider.",
      booking,
      provider_contact: booking.service.provider_contact,
    });
  } catch (err) {
    console.error("verifyBookingPayment:", err);
    res.status(500).json({ message: "Payment verification failed.", error: err.message });
  }
};

// GET /api/bookings/:id
export const getBookingById = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id).populate(
      "service",
      "title provider_name price booking_fee image_url provider_contact"
    );
    if (!booking) return res.status(404).json({ message: "Booking not found." });

    const isPaid = booking.payment_status === "paid";

    res.json({
      _id:                    booking._id,
      status:                 booking.status,
      payment_status:         booking.payment_status,
      payment_method:         booking.payment_method,
      booking_fee_amount:     booking.booking_fee_amount,
      service_price_snapshot: booking.service_price_snapshot,
      provider_name_snapshot: booking.provider_name_snapshot,
      service:                booking.service,
      createdAt:              booking.createdAt,
      provider_contact:       isPaid ? booking.service.provider_contact : null,
    });
  } catch (err) {
    console.error("getBookingById:", err);
    res.status(500).json({ message: "Failed to fetch booking." });
  }
};

// ─────────────────────────────────────────────
// ADMIN ROUTES
// ─────────────────────────────────────────────

// GET /api/bookings/admin/all
export const getAllBookingsAdmin = async (req, res) => {
  try {
    const { status, service_id, search, page = 1, limit = 20 } = req.query;

    const query = {};
    if (status)     query.status  = status;
    if (service_id) query.service = service_id;
    if (search) {
      query.$or = [
        { customer_name:  { $regex: search, $options: "i" } },
        { customer_email: { $regex: search, $options: "i" } },
        { customer_phone: { $regex: search, $options: "i" } },
      ];
    }

    const skip  = (Number(page) - 1) * Number(limit);
    const total = await Booking.countDocuments(query);

    const bookings = await Booking.find(query)
      .populate("service", "title provider_name booking_fee")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    res.json({ bookings, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    console.error("getAllBookingsAdmin:", err);
    res.status(500).json({ message: "Failed to fetch bookings." });
  }
};

// PATCH /api/bookings/admin/:id/status
export const updateBookingStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ["pending", "confirmed", "in_progress", "completed", "cancelled"];

    if (!allowed.includes(status)) {
      return res.status(400).json({ message: `Status must be one of: ${allowed.join(", ")}` });
    }

    const booking = await Booking.findByIdAndUpdate(
      req.params.id,
      { $set: { status } },
      { new: true }
    ).populate("service", "title provider_name");

    if (!booking) return res.status(404).json({ message: "Booking not found." });

    res.json({ message: "Booking status updated.", booking });
  } catch (err) {
    console.error("updateBookingStatus:", err);
    res.status(500).json({ message: "Failed to update booking status." });
  }
};

// GET /api/bookings/admin/stats
export const getBookingStats = async (req, res) => {
  try {
    const [summary] = await Booking.aggregate([
      { $match: { payment_status: "paid" } },
      {
        $group: {
          _id:                          null,
          total_booking_fees_collected: { $sum: "$booking_fee_amount" },
          total_confirmed_bookings:     { $sum: 1 },
        },
      },
    ]);

    const perService = await Booking.aggregate([
      { $match: { payment_status: "paid" } },
      { $group: { _id: "$service", bookings: { $sum: 1 }, fees_collected: { $sum: "$booking_fee_amount" } } },
      { $lookup: { from: "services", localField: "_id", foreignField: "_id", as: "service" } },
      { $unwind: "$service" },
      { $project: { service_title: "$service.title", provider_name: "$service.provider_name", bookings: 1, fees_collected: 1 } },
      { $sort: { fees_collected: -1 } },
    ]);

    const byMethod = await Booking.aggregate([
      { $match: { payment_status: "paid" } },
      { $group: { _id: "$payment_method", bookings: { $sum: 1 }, fees_collected: { $sum: "$booking_fee_amount" } } },
    ]);

    res.json({
      summary:     summary || { total_booking_fees_collected: 0, total_confirmed_bookings: 0 },
      per_service: perService,
      by_method:   byMethod,
    });
  } catch (err) {
    console.error("getBookingStats:", err);
    res.status(500).json({ message: "Failed to fetch booking stats." });
  }
};