import rateLimit from "express-rate-limit";

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // 10 attempts per 15 min per IP — covers login/signup/password-reset
  message: "Too many attempts, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

export const paymentLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  message: "Too many payment attempts, please slow down.",
  standardHeaders: true,
  legacyHeaders: false,
});