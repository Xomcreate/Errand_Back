// routes/cryptoRoutes.js
import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
  initCryptoPayment,
  getCryptoPaymentStatus,
  handleCryptoIPN,
} from "../controllers/cryptoController.js";

const router = express.Router();

router.post("/init", protect, initCryptoPayment);
router.get("/:id/status", protect, getCryptoPaymentStatus);

// NOTE: mount this WITHOUT `protect` (NOWPayments calls it directly, the
// HMAC signature is the auth) and WITH a raw-body parser so the exact
// bytes are available for signature verification, e.g. in app.js:
//
//   app.use("/payments/crypto/ipn", express.raw({ type: "*/*" }), (req, res, next) => {
//     req.body = JSON.parse(req.body.toString("utf8"));
//     next();
//   });
//
router.post("/ipn", handleCryptoIPN);

export default router;