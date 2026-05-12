import axios from "axios";
import Order from "../models/Order.js";
import Payment from "../models/Payment.js"; 

const PAYSTACK_API = "https://api.paystack.co";

const getPaystackSecret = () => process.env.PAYSTACK_SECRET_KEY;

// ================= INIT PAYMENT =================
export const initPaystackPayment = async (req, res) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({ message: "orderId is required" });
    }

    const order = await Order.findById(orderId).populate("user", "email");

    if (!order) return res.status(404).json({ message: "Order not found" });

    if (!order.user || !order.user.email) {
      return res.status(400).json({ message: "Order user email not found" });
    }

    if (order.paymentStatus === "paid") {
      return res.status(400).json({ message: "Already paid" });
    }

    const amount = Math.round(order.totalAmount * 100);
    const reference = `ORDER_${order._id}_${Date.now()}`;

    // Get frontend origin from request, remove any trailing slash
    const frontendOrigin = req.headers.origin
      ? req.headers.origin.replace(/\/$/, "")
      : process.env.FRONTEND_URL?.replace(/\/$/, "");

    const response = await axios.post(
      `${PAYSTACK_API}/transaction/initialize`,
      {
        email: order.user.email,
        amount,
        reference,
        metadata: {
          orderId: order._id.toString(),
        },
        callback_url: `${frontendOrigin}/payment/verify`,
      },
      {
        headers: {
          Authorization: `Bearer ${getPaystackSecret()}`,
          "Content-Type": "application/json",
        },
      }
    );

    order.paymentReference = reference;
    order.paymentMethod = "paystack";
    await order.save();

    return res.json({
      success: true,
      authorization_url: response.data.data.authorization_url,
      reference,
    });

  } catch (err) {
    console.error("INIT ERROR:", err.response?.data || err.message);
    return res.status(500).json({ message: "Paystack init failed" });
  }
};

// ================= VERIFY PAYMENT =================
export const verifyPaystackPayment = async (req, res) => {
  try {
    const { reference } = req.params;

    if (!reference) {
      return res.status(400).json({ message: "Reference is required" });
    }

    const response = await axios.get(
      `${PAYSTACK_API}/transaction/verify/${reference}`,
      { headers: { Authorization: `Bearer ${getPaystackSecret()}` } }
    );

    const data = response.data.data;

    if (data.status !== "success") {
      return res.status(400).json({ message: "Payment not successful" });
    }

    const orderId = data.metadata?.orderId;
    if (!orderId) {
      return res.status(400).json({ message: "Order ID missing from metadata" });
    }

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Order not found" });

    const expectedAmount = Math.round(order.totalAmount * 100);
    if (data.amount !== expectedAmount) {
      return res.status(400).json({ message: "Amount mismatch" });
    }

    if (order.paymentReference && order.paymentReference !== reference) {
      return res.status(400).json({ message: "Reference mismatch" });
    }

    // ✅ Prevent double-processing
    if (order.paymentStatus === "paid") {
      return res.json({ success: true, order });
    }

    order.paymentStatus = "paid";
    order.status = "processing";
    order.paymentMethod = "paystack";
    order.paymentReference = reference;
    await order.save();

    // ✅ FIX: Create the Payment record so dashboard works
    await Payment.create({
      orderId: order._id,
      userId: order.user,
      reference,
      amount: order.totalAmount,
      status: "success",
      type: "sale",
      gateway: "paystack",
    });

    return res.json({ success: true, order });

  } catch (err) {
    console.error("VERIFY ERROR:", err.response?.data || err.message);
    return res.status(500).json({ message: "Verification failed" });
  }
};


// paystackController.js — add at the bottom
export const verifyBankAccount = async (req, res) => {
  try {
    const { account_number, bank_code } = req.query;

    if (!account_number || !bank_code) {
      return res.status(400).json({ message: "account_number and bank_code are required" });
    }

    const { data } = await axios.get(
      `${PAYSTACK_API}/bank/resolve?account_number=${account_number}&bank_code=${bank_code}`,
      {
        headers: {
          Authorization: `Bearer ${getPaystackSecret()}`,  // ✅ works here
        },
      }
    );

    return res.json({
      account_name: data.data.account_name,
      account_number: data.data.account_number,
    });

  } catch (err) {
    console.error("VERIFY ACCOUNT ERROR:", err.response?.data || err.message);
    return res.status(400).json({
      message: err.response?.data?.message || "Could not verify account. Check number and bank.",
    });
  }
};