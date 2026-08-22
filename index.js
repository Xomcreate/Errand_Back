import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import connectDB from "./dbconnect/dbconfig.js";
import path from "path";
import { fileURLToPath } from "url";
import cookieParser from "cookie-parser";

import contactRoutes from "./routes/contactRoutes.js";
import insiderRoutes from "./routes/insiderRoutes.js";
import sellerInquiryRoutes from "./routes/sellerInquiryRoutes.js";
import reviewRoutes from "./routes/reviewRoutes.js";
import newsletterRoutes from "./routes/newsletterRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import wishlistRoutes from "./routes/wishlistRoutes.js";
import categoryRoutes from "./routes/categoryRoutes.js";
import referralRoutes from "./routes/referralRoutes.js";
import walletRoutes from "./routes/walletRoutes.js"; // ← ADD THIS
import vendorProductRoutes from "./routes/vendorProductRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import orderRoutes from "./routes/OrderRoutes.js";
import vendorReviewRoutes from "./routes/vendorReviewRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import vendorPlanRoutes from "./routes/vendorPlanRoutes.js";
import jobRoutes from "./routes/jobRoutes.js";
import serviceRoutes from "./routes/serviceRoutes.js";
import bookingRoutes from "./routes/bookingRoutes.js";
import cryptoRoutes from "./routes/cryptoRoutes.js";

import { errorHandler } from "./middleware/errorMiddleware.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

connectDB();

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());

// ── NOWPayments IPN webhook — MUST be mounted BEFORE express.json() ──────────
// NOWPayments signs the exact raw bytes of the request body. If the global
// express.json() below parses it first, the signature check in
// cryptoController.js's handleCryptoIPN will fail every time (re-serialized
// JSON doesn't byte-for-byte match what NOWPayments hashed). So this one path
// gets its own raw-body handling, ahead of the global JSON parser.
app.use(
  "/payments/crypto/ipn",
  express.raw({ type: "*/*" }),
  (req, res, next) => {
    try {
      req.body = JSON.parse(req.body.toString("utf8"));
      next();
    } catch (err) {
      return res.status(400).json({ message: "Invalid IPN payload" });
    }
  }
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api/auth",            authRoutes);
app.use("/api/contacts",        contactRoutes);
app.use("/api/insider",         insiderRoutes);
app.use("/api/seller",          sellerInquiryRoutes);
app.use("/api/products",        productRoutes);
app.use("/api/categories",      categoryRoutes);
app.use("/api/reviews",         reviewRoutes);
app.use("/api/vendor-reviews",  vendorReviewRoutes);
app.use("/api/newsletter",      newsletterRoutes);
app.use("/api/referrals",       referralRoutes);
app.use("/api/wallet",          walletRoutes);  // ← ADD THIS
app.use("/api/orders",          orderRoutes);
app.use("/api/payments",        paymentRoutes);
app.use("/api/services", serviceRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/vendor-products", vendorProductRoutes);
app.use("/api/vendor-plan",     vendorPlanRoutes);
app.use("/api/notifications",   notificationRoutes);
app.use("/api/jobs",            jobRoutes);

// NOTE: /payments/crypto/ipn (mounted above with the raw-body parser) is
// part of this same router — cryptoRoutes.js defines /init, /:id/status,
// and /ipn together, so mounting the router again here is what actually
// wires up /init and /status. The raw-body middleware above only applies
// to the /ipn sub-path specifically, so this is safe.
app.use("/api/payments/crypto", cryptoRoutes);

// ── Test route ────────────────────────────────────────────────────────────────
app.get("/", (req, res) => res.send("Backend working!"));
console.log("Paystack key in use:", process.env.PAYSTACK_SECRET_KEY?.slice(0, 12));

// ── Error handler (must be last) ──────────────────────────────────────────────
app.use(errorHandler);

app.listen(PORT, () =>
  console.log(`Server running at http://localhost:${PORT}`)
);