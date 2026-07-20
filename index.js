import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
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
import walletRoutes from "./routes/walletRoutes.js";
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
import { authLimiter, paymentLimiter } from "./middleware/rateLimiters.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

connectDB();

// ── Trust proxy (needed if deployed on Render/Railway/Heroku/behind Nginx) ─────
app.set("trust proxy", 1);

// ── Security middleware ─────────────────────────────────────────────────────
app.use(helmet());

app.use(cors({
  origin: process.env.FRONTEND_URL, // e.g. "https://yourstore.com" — NOT "*"
  credentials: true,
}));

// General rate limit — applies to every request
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many requests, please try again later.",
}));

app.use(express.json({ limit: "10kb" })); // caps body size — blocks payload-bloat abuse
app.use(express.urlencoded({ extended: true, limit: "10kb" }));
app.use(cookieParser());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api/auth",            authLimiter, authRoutes); // strict limit on login/signup
app.use("/api/contacts",        contactRoutes);
app.use("/api/insider",         insiderRoutes);
app.use("/api/seller",          sellerInquiryRoutes);
app.use("/api/products",        productRoutes);
app.use("/api/categories",      categoryRoutes);
app.use("/api/reviews",         reviewRoutes);
app.use("/api/vendor-reviews",  vendorReviewRoutes);
app.use("/api/newsletter",      newsletterRoutes);
app.use("/api/referrals",       referralRoutes);
app.use("/api/wallet",          walletRoutes);
app.use("/api/orders",          orderRoutes);
app.use("/api/payments",        paymentLimiter, paymentRoutes); // strict limit on payments
app.use("/api/services",        serviceRoutes);
app.use("/api/bookings",        bookingRoutes);
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