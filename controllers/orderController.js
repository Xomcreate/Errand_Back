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
    platformProducts.forEach((p) => (productMap[p._id.toString()] = p));
    vendorProducts.forEach((p) => (productMap[p._id.toString()] = p));

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

    res.status(201).json({ success: true, order });
  } catch (err) {
    console.error("Order error:", err);
    res.status(500).json({ message: err.message });
  }
};

// =========================
// SAVE DELIVERY INFO
// =========================
export const saveDeliveryInfo = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      fullName,
      phone,
      country,
      state,
      city,
      street,
      landmark,
    } = req.body;

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (String(order.user) !== String(req.user._id)) {
      return res.status(403).json({ message: "Not allowed" });
    }

    order.deliveryInfo = {
      fullName,
      phone,
      country,
      state,
      city,
      street,
      landmark,
    };

    await order.save();

    return res.json({
      success: true,
      message: "Delivery info saved",
      order,
    });
  } catch (err) {
    console.error("SAVE DELIVERY ERROR:", err.message);
    return res.status(500).json({ message: "Failed to save delivery info" });
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
    res.status(500).json({ message: err.message });
  }
};

// =========================
// GET MY ORDERS (logged in user)
// =========================
export const getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user.id }).sort({ createdAt: -1 });

    // Collect all productIds from all orders
    const allProductIds = orders.flatMap(o => o.items.map(i => i.productId));

    // Fetch from both models
    const [platformProducts, vendorProducts] = await Promise.all([
      Product.find({ _id: { $in: allProductIds } }).select("name price images"),
      VendorProduct.find({ _id: { $in: allProductIds } }).select("name price images"),
    ]);

    // Build a lookup map
    const productMap = {};
    platformProducts.forEach(p => (productMap[p._id.toString()] = p));
    vendorProducts.forEach(p => (productMap[p._id.toString()] = p));

    // Attach product info to each order item
    const enrichedOrders = orders.map(order => ({
      ...order._doc,
      items: order.items.map(item => ({
        ...item._doc,
        productId: productMap[item.productId?.toString()] || { name: "Product", price: item.price },
      })),
    }));

    res.json({ success: true, orders: enrichedOrders });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
// =========================
// GET SINGLE ORDER
// =========================
export const getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate("user", "name email");

    if (!order) return res.status(404).json({ message: "Order not found" });

    if (
      order.user._id.toString() !== req.user.id &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({ message: "Not authorized" });
    }

    res.json({ success: true, order });
  } catch (err) {
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

    if (!order) return res.status(404).json({ message: "Order not found" });

    res.json({ success: true, order });
  } catch (err) {
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

    const vendorOrders = orders.map((order) => ({
      ...order._doc,
      items: order.items.filter(
        (item) => item.vendorId?.toString() === vendorId
      ),
    }));

    res.json({ success: true, orders: vendorOrders });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
