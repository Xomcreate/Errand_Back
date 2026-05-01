import axios from "axios";
import Payment from "../models/Payment.js";

const PAYSTACK_API = "https://api.paystack.co";

export const getAllPayments = async (req, res) => {
  try {
    const payments = await Payment.find()
      .populate("userId", "name email")
      .populate("orderId")
      .sort({ createdAt: -1 });

    res.json({ success: true, payments });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const refundPayment = async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id);

    if (!payment) {
      return res.status(404).json({ message: "Payment not found" });
    }

    // ✅ FIX: Prevent double refund
    if (payment.type === "refund") {
      return res.status(400).json({ message: "Payment already refunded" });
    }

    if (!payment.reference) {
      return res.status(400).json({ message: "No reference to refund" });
    }

    // ✅ FIX: Actually call Paystack to process the refund
    const paystackRes = await axios.post(
      `${PAYSTACK_API}/refund`,
      {
        transaction: payment.reference,
        amount: Math.round(payment.amount * 100), // in kobo
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!paystackRes.data.status) {
      return res.status(400).json({ message: "Paystack refund failed" });
    }

    payment.type = "refund";
    payment.status = "success";
    await payment.save();

    res.json({ success: true, message: "Refund successful", payment });

  } catch (err) {
    console.error("REFUND ERROR:", err.response?.data || err.message);
    res.status(500).json({ message: err.message });
  }
};