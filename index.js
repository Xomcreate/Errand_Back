import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import connectDB from "./dbconnect/dbconfig.js";

import contactRoutes from "./routes/contactRoutes.js";
import insiderRoutes from "./routes/insiderRoutes.js";
import sellerInquiryRoutes from "./routes/sellerInquiryRoutes.js";
import reviewRoutes from "./routes/reviewRoutes.js";
import newsletterRoutes from "./routes/newsletterRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import authRoutes from "./routes/authRoutes.js"; // ✅ FIXED
import wishlistRoutes from "./routes/wishlistRoutes.js";
import categoryRoutes from "./routes/categoryRoutes.js";
import referralRoutes from "./routes/referralRoutes.js";
import vendorProductRoutes from "./routes/vendorProductRoutes.js";
import cookieParser from "cookie-parser";
// import checkoutRoutes from "./routes/checkoutRoutes.js";
import orderRoutes from "./routes/OrderRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import { errorHandler } from "./middleware/errorMiddleware.js"; // ✅ FIXED
; // if you have it



import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Fix __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database connection
connectDB();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
// Serve uploaded files statically
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Routes
app.use("/api/contacts", contactRoutes);
app.use("/api/insider", insiderRoutes);
app.use("/api/seller", sellerInquiryRoutes);
app.use("/api/products", productRoutes);
app.use("/api/categories",categoryRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/newsletter", newsletterRoutes);
app.use("/api/referrals", referralRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/vendor-products", vendorProductRoutes);


app.use("/api/auth", authRoutes);

// Error middleware (ALWAYS LAST)
app.use(errorHandler);

// Test route
app.get("/", (req, res) => res.send("Backend working!"));

app.listen(PORT, () =>
  console.log(`Server running at http://localhost:${PORT}`)
);
