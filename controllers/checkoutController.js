import Order from "../models/Order.js";
import Product from "../models/Product.js";
import VendorProduct from "../models/VendorProduct.js";

export const checkout = async (req, res) => {
  try {
    const userId = req.user.id;
    const { items } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ message: "Cart is empty" });
    }

    const productIds = items.map((i) => i.productId);

    const [platformProducts, vendorProducts] = await Promise.all([
      Product.find({ _id: { $in: productIds } }),
      VendorProduct.find({ _id: { $in: productIds } }),
    ]);

    const productMap = {};

    platformProducts.forEach((p) => {
      productMap[p._id.toString()] = p;
    });

    vendorProducts.forEach((p) => {
      productMap[p._id.toString()] = p;
    });

    if (Object.keys(productMap).length === 0) {
      return res.status(404).json({ message: "No products found" });
    }

    let totalAmount = 0;
    const orderItems = [];

    for (const item of items) {
      const product = productMap[item.productId];

      if (!product) continue;

      const realPrice = product.price;
      totalAmount += realPrice * item.quantity;

      orderItems.push({
        productId: item.productId,
        quantity: item.quantity,
        price: realPrice,
        vendorId: item.vendorId || null,
      });
    }

    if (orderItems.length === 0) {
      return res.status(404).json({ message: "No valid products found" });
    }

    const order = await Order.create({
      user: userId,
      items: orderItems,
      totalAmount,
      status: "pending",
      paymentStatus: "pending",
    });

    return res.status(201).json({
      message: "Order created successfully",
      order,
    });

  } catch (error) {
    console.error("Checkout error:", error);
    res.status(500).json({ message: "Server error" });
  }
};