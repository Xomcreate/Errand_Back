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

import { errorHandler } from "./middleware/errorMiddleware.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

connectDB();

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
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

// ── Test route ────────────────────────────────────────────────────────────────
app.get("/", (req, res) => res.send("Backend working!"));

// ── Error handler (must be last) ──────────────────────────────────────────────
app.use(errorHandler);

app.listen(PORT, () =>
  console.log(`Server running at http://localhost:${PORT}`)
);