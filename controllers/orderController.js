import Order from "../models/Order.js";
import Product from "../models/Product.js";

// CREATE ORDER (checkout)
export const createOrder = async (req, res) => {
  try {
    const userId = req.user.id;
    const { items } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ message: "Cart is empty" });
    }

    let total = 0;
    const orderItems = [];

    for (const item of items) {
      const product = await Product.findById(item.product);

      if (!product) continue;

      const itemTotal = product.price * item.quantity;
      total += itemTotal;

      orderItems.push({
        product: product._id,
        quantity: item.quantity,
        price: product.price,
      });
    }

    const order = await Order.create({
      user: userId,
      items: orderItems,
      totalAmount: total,
      status: "pending",
    });

    res.status(201).json({
      success: true,
      order,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};