import Order from "../models/Order.js";
import Product from "../models/Product.js";
import VendorProduct from "../models/VendorProduct.js";

// =========================
// CREATE ORDER (checkout)
// =========================
export const createOrder = async (req, res) => {
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

    res.status(201).json({
      success: true,
      order,
    });

  } catch (err) {
    console.error("Order error:", err);
    res.status(500).json({ message: err.message });
  }
};

// =========================
// GET ALL ORDERS (admin)
// =========================
export const getAllOrders = async (req, res) => {
  try {
    const orders = await Order.find()
      .populate("user", "name email")
      .sort({ createdAt: -1 });

    res.json({ success: true, orders });
  } catch (err) {
    console.error("Get orders error:", err);
    res.status(500).json({ message: err.message });
  }
};

// =========================
// GET MY ORDERS (logged in user)
// =========================
export const getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user.id })
      .sort({ createdAt: -1 });

    res.json({ success: true, orders });
  } catch (err) {
    console.error("Get my orders error:", err);
    res.status(500).json({ message: err.message });
  }
};

// =========================
// GET SINGLE ORDER
// =========================
export const getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate("user", "name email");

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // only owner or admin can view
    if (
      order.user._id.toString() !== req.user.id &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({ message: "Not authorized" });
    }

    res.json({ success: true, order });
  } catch (err) {
    console.error("Get order error:", err);
    res.status(500).json({ message: err.message });
  }
};

// =========================
// UPDATE ORDER STATUS (admin)
// =========================
export const updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    res.json({ success: true, order });
  } catch (err) {
    console.error("Update order error:", err);
    res.status(500).json({ message: err.message });
  }
};

// =========================
// GET VENDOR ORDERS
// =========================
export const getVendorOrders = async (req, res) => {
  try {
    const vendorId = req.user.id;

    const orders = await Order.find({
      "items.vendorId": vendorId,
    }).sort({ createdAt: -1 });

    // filter items to only show this vendor's items
    const vendorOrders = orders.map((order) => ({
      ...order._doc,
      items: order.items.filter(
        (item) => item.vendorId?.toString() === vendorId
      ),
    }));

    res.json({ success: true, orders: vendorOrders });
  } catch (err) {
    console.error("Vendor orders error:", err);
    res.status(500).json({ message: err.message });
  }
};