import Service from "../models/Service.js";
import Booking from "../models/Booking.js";

const LISTING_FEES = {
  standard: 1000,
  featured: 3000,
  premium:  5000,
};

const ALLOWED_DURATIONS = [10, 15, 30, 60, 90];

// ─────────────────────────────────────────────
// PUBLIC ROUTES
// ─────────────────────────────────────────────

// GET /api/services
export const getPublicServices = async (req, res) => {
  try {
    const { search = "", category = "", page = 1, limit = 20 } = req.query;

    const query = {
      status: "active",
      $or: [
        { listing_expires_at: null },
        { listing_expires_at: { $gt: new Date() } },
      ],
    };

    if (search) {
      query.$and = [{
        $or: [
          { title:         { $regex: search, $options: "i" } },
          { provider_name: { $regex: search, $options: "i" } },
          { description:   { $regex: search, $options: "i" } },
        ],
      }];
    }

    if (category) query.category = { $regex: category, $options: "i" };

    const skip  = (Number(page) - 1) * Number(limit);
    const total = await Service.countDocuments(query);

    const services = await Service.find(query)
      .select("title description provider_name price image_url category listing_type booking_fee total_bookings listing_expires_at createdAt")
      .sort({ listing_type: -1, createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    res.json({ services, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    console.error("getPublicServices:", err);
    res.status(500).json({ message: "Failed to fetch services." });
  }
};

// GET /api/services/:id
// NOTE: provider_contact is deliberately excluded here — it's only revealed
// after a booking fee is paid (see bookingController.getBookingById / pay endpoints).
export const getPublicServiceById = async (req, res) => {
  try {
    const service = await Service.findOne({ _id: req.params.id, status: "active" })
      .select("-listing_fee_paid -booking_fee_earned -total_bookings -provider_contact");

    if (!service) return res.status(404).json({ message: "Service not found or not available." });

    res.json(service);
  } catch (err) {
    console.error("getPublicServiceById:", err);
    res.status(500).json({ message: "Failed to fetch service." });
  }
};

// ─────────────────────────────────────────────
// ADMIN ROUTES
// ─────────────────────────────────────────────

// GET /api/services/admin/all
export const getAllServicesAdmin = async (req, res) => {
  try {
    const { search = "", status = "all" } = req.query;

    const query = {};
    if (status !== "all") query.status = status;
    if (search) {
      query.$or = [
        { title:         { $regex: search, $options: "i" } },
        { provider_name: { $regex: search, $options: "i" } },
      ];
    }

    const services = await Service.find(query).sort({ createdAt: -1 });

    const result = services.map((s) => {
      const obj = s.toJSON();
      obj.commission_earned = obj.booking_fee_earned;
      return obj;
    });

    res.json(result);
  } catch (err) {
    console.error("getAllServicesAdmin:", err);
    res.status(500).json({ message: "Failed to fetch services." });
  }
};

// POST /api/services/admin
export const createService = async (req, res) => {
  try {
    const {
      title, description, provider_name,
      price, category,
      listing_type = "standard",
      listing_fee_paid,
      booking_fee,
      status = "pending",
      listing_duration_days = 30,
      provider_contact_phone    = "",
      provider_contact_email    = "",
      provider_contact_whatsapp = "",
      provider_contact_address  = "",
    } = req.body;

    if (!title || price === undefined || price === null) {
      return res.status(400).json({ message: "Title and price are required." });
    }
    if (!["standard", "featured", "premium"].includes(listing_type)) {
      return res.status(400).json({ message: "Invalid listing type." });
    }

    const resolvedDuration = ALLOWED_DURATIONS.includes(Number(listing_duration_days))
      ? Number(listing_duration_days)
      : 30;

    // Build image URL from uploaded file if present, else fallback to body field
    const base      = process.env.SERVER_URL || `${req.protocol}://${req.get("host")}`;
    const image_url = req.file
      ? `${base}/uploads/${req.file.filename}`
      : (req.body.image_url || "");

    const resolvedListingFee = listing_fee_paid !== undefined
      ? Number(listing_fee_paid)
      : LISTING_FEES[listing_type];

    const resolvedBookingFee = booking_fee !== undefined ? Number(booking_fee) : 500;

    const service = await Service.create({
      title, description, provider_name,
      price:            Number(price),
      image_url,
      category,
      listing_type,
      listing_fee_paid: resolvedListingFee,
      booking_fee:      resolvedBookingFee,
      status,
      listing_duration_days: resolvedDuration,
      provider_contact: {
        phone:    provider_contact_phone,
        email:    provider_contact_email,
        whatsapp: provider_contact_whatsapp,
        address:  provider_contact_address,
      },
    });

    res.status(201).json(service.toJSON());
  } catch (err) {
    console.error("createService:", err);
    res.status(500).json({ message: "Failed to create service.", error: err.message });
  }
};

// PATCH /api/services/admin/:id
export const updateService = async (req, res) => {
  try {
    const allowed = [
      "title", "description", "provider_name", "price",
      "image_url", "category", "listing_type",
      "listing_fee_paid", "booking_fee", "status",
      "listing_duration_days",
    ];

    const updates = {};
    allowed.forEach((field) => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    if (updates.listing_duration_days !== undefined) {
      const d = Number(updates.listing_duration_days);
      updates.listing_duration_days = ALLOWED_DURATIONS.includes(d) ? d : 30;
    }

    // Nested provider_contact fields
    ["phone", "email", "whatsapp", "address"].forEach((f) => {
      const key = `provider_contact_${f}`;
      if (req.body[key] !== undefined) updates[`provider_contact.${f}`] = req.body[key];
    });

    // If a new file was uploaded, override image_url
    if (req.file) {
      const base = process.env.SERVER_URL || `${req.protocol}://${req.get("host")}`;
      updates.image_url = `${base}/uploads/${req.file.filename}`;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "No valid fields provided." });
    }

    const service = await Service.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!service) return res.status(404).json({ message: "Service not found." });

    const obj = service.toJSON();
    obj.commission_earned = obj.booking_fee_earned;
    res.json(obj);
  } catch (err) {
    console.error("updateService:", err);
    res.status(500).json({ message: "Failed to update service.", error: err.message });
  }
};

// DELETE /api/services/admin/:id
export const deleteService = async (req, res) => {
  try {
    const service = await Service.findByIdAndDelete(req.params.id);
    if (!service) return res.status(404).json({ message: "Service not found." });

    await Booking.deleteMany({ service: req.params.id });

    res.json({ message: "Service and associated bookings deleted." });
  } catch (err) {
    console.error("deleteService:", err);
    res.status(500).json({ message: "Failed to delete service." });
  }
};

// GET /api/services/admin/stats
export const getServiceStats = async (req, res) => {
  try {
    const [agg] = await Service.aggregate([
      {
        $group: {
          _id: null,
          total_services:      { $sum: 1 },
          active_count:        { $sum: { $cond: [{ $eq: ["$status", "active"]  }, 1, 0] } },
          pending_count:       { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } },
          total_listing_fees:  { $sum: "$listing_fee_paid" },
          total_booking_fees:  { $sum: "$booking_fee_earned" },
        },
      },
    ]);

    const stats = agg || {
      total_services: 0, active_count: 0, pending_count: 0,
      total_listing_fees: 0, total_booking_fees: 0,
    };
    stats.total_revenue = (stats.total_listing_fees || 0) + (stats.total_booking_fees || 0);

    res.json(stats);
  } catch (err) {
    console.error("getServiceStats:", err);
    res.status(500).json({ message: "Failed to fetch stats." });
  }
};

// PATCH /api/services/admin/expire-check
export const expireListings = async (req, res) => {
  try {
    const result = await Service.updateMany(
      { status: "active", listing_expires_at: { $lt: new Date() } },
      { $set: { status: "expired" } }
    );
    res.json({ message: `${result.modifiedCount} listing(s) marked as expired.` });
  } catch (err) {
    console.error("expireListings:", err);
    res.status(500).json({ message: "Failed to expire listings." });
  }
};