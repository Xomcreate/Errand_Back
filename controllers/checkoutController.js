import Order from "../models/Order.js";
import Product from "../models/Product.js";

// POST /api/checkout
export const checkout = async (req, res) => {
  try {
    const userId = req.user.id; // from auth middleware
    const { items } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ message: "Cart is empty" });
    }

    // Fetch products from DB to get real prices
    const productIds = items.map((i) => i.product);

    const products = await Product.find({ _id: { $in: productIds } });

    if (!products.length) {
      return res.status(404).json({ message: "Products not found" });
    }

    // Calculate total
    let totalAmount = 0;

    const orderItems = items.map((item) => {
      const product = products.find(
        (p) => p._id.toString() === item.product
      );

      if (!product) return null;

      totalAmount += product.price * item.quantity;

      return {
        product: product._id,
        quantity: item.quantity,
      };
    }).filter(Boolean);

    // Create order
    const order = await Order.create({
      user: userId,
      items: orderItems,
      totalAmount,
    });

    return res.status(201).json({
      message: "Order placed successfully",
      order,
    });
  } catch (error) {
    console.error("Checkout error:", error);
    res.status(500).json({ message: "Server error" });
  }
};