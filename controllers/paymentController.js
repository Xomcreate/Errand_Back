import axios from "axios";
import Order from "../models/Order.js";

export const payForOrder = async (req, res) => {
  try {
    const { orderId } = req.body;
    const order = await Order.findById(orderId);

    if (!order) return res.status(404).json({ message: "Order not found" });

    const response = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      {
        email: req.user.email,
        amount: order.totalAmount * 100, // kobo
        reference: `ORDER_${order._id}_${Date.now()}`,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET}`,
        },
      }
    );

    order.paymentReference = response.data.data.reference;
    await order.save();

    res.json(response.data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};