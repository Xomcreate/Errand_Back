// routes/cryptoRoutes.js
import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
  initCryptoPayment,
  getCryptoPaymentStatus,
  handleCryptoIPN,
} from "../controllers/cryptoController.js";

const router = express.Router();

// Order checkout requires a logged-in user (ownership check happens inside
// initCryptoPayment against req.user._id), so this keeps `protect`.
router.post("/init", protect, initCryptoPayment);

// NOT protected: this endpoint is polled by both order checkout (logged in)
// and booking checkout (guest, no auth token at all — see createBooking).
// getCryptoPaymentStatus enforces ownership itself when payment.user is
// set (the order case); booking payments have no user to check against,
// so the unguessable payment _id is what limits access there.
router.get("/:id/status", getCryptoPaymentStatus);

// NOTE: mount this WITHOUT `protect` (NOWPayments calls it directly, the
// HMAC signature is the auth) and WITH a raw-body parser so the exact
// bytes are available for signature verification, e.g. in app.js:
//
//   app.use("/api/payments/crypto/ipn", express.raw({ type: "*/*" }), (req, res, next) => {
//     req.body = JSON.parse(req.body.toString("utf8"));
//     next();
//   });
//
router.post("/ipn", handleCryptoIPN);

export default router;