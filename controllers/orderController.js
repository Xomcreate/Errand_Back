import Order from "../models/Order.js";
import Product from "../models/Product.js";
import VendorProduct from "../models/VendorProduct.js";
import User from "../models/User.js";
import nodemailer from "nodemailer";

// ─────────────────────────────────────────────────────────────────────────────
// COMMISSION RATES BY PRODUCT CATEGORY (percentage taken by platform)
// Edit these values to adjust your commission structure.
// ─────────────────────────────────────────────────────────────────────────────
export const COMMISSION_RATES = {
  electronics:   0.08,   //  8%
  fashion:       0.12,   // 12%
  beauty:        0.10,   // 10%
  food:          0.05,   //  5%
  health:        0.08,   //  8%
  home:          0.10,   // 10%
  sports:        0.10,   // 10%
  books:         0.07,   //  7%
  toys:          0.10,   // 10%
  automotive:    0.06,   //  6%
  default:       0.10,   // 10% — fallback for unmapped categories
};

/**
 * Given a category string, return the platform commission rate (0–1).
 */
export const getCommissionRate = (category) => {
  if (!category) return COMMISSION_RATES.default;
  const key = category.toLowerCase().trim();
  return COMMISSION_RATES[key] ?? COMMISSION_RATES.default;
};

/**
 * Calculate commission breakdown for a set of order items.
 * Returns { grossTotal, commission, vendorNet } per party.
 *
 * @param {Array} items  – order items (each with price, quantity, vendorId)
 * @param {Object} productMap – map of productId → product doc (must include `category`)
 * @returns {Array} [{ partyKey, isPlatform, gross, commission, net, rate }]
 */
export const calcCommissionBreakdown = (items, productMap) => {
  // Group items by party
  const parties = {};
  for (const item of items) {
    const key = item.vendorId ? item.vendorId.toString() : "__platform__";
    if (!parties[key]) parties[key] = { key, isPlatform: !item.vendorId, items: [] };
    parties[key].items.push(item);
  }

  return Object.values(parties).map((party) => {
    let gross = 0;
    let commission = 0;

    for (const item of party.items) {
      const product  = productMap[item.productId?.toString()];
      const category = product?.category || null;
      const rate     = party.isPlatform ? 0 : getCommissionRate(category); // platform keeps everything; vendors pay commission
      const lineTotal = (item.price || 0) * (item.quantity || 1);
      gross      += lineTotal;
      commission += lineTotal * rate;
    }

    return {
      partyKey:   party.key,
      isPlatform: party.isPlatform,
      gross:      Math.round(gross),
      commission: Math.round(commission),
      net:        Math.round(gross - commission),   // what the vendor actually receives
      rate:       party.isPlatform ? 0 : null,       // null = per-item mixed rate
    };
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL TRANSPORTER
// ─────────────────────────────────────────────────────────────────────────────
const makeTransporter = () =>
  nodemailer.createTransport({
    host:   process.env.SMTP_HOST || "smtp.gmail.com",
    port:   Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

const STORE    = process.env.STORE_NAME    || "Marketplace";
const FROM     = process.env.SMTP_USER;
const FRONTEND = process.env.FRONTEND_URL  || "http://localhost:3000";

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const getOrderPartyKeys = (order) => {
  const keys = new Set();
  for (const item of order.items || []) {
    keys.add(item.vendorId ? item.vendorId.toString() : "__platform__");
  }
  return [...keys];
};

const allPartiesShipped = (order) => {
  const required = getOrderPartyKeys(order);
  const shipped  = (order.partyShipments || []).map((s) => s.partyKey);
  return required.every((k) => shipped.includes(k));
};

const allShippedPartiesConfirmed = (order) => {
  const shipped   = (order.partyShipments || []).map((s) => s.partyKey);
  const confirmed = (order.partyConfirmations || []).map((c) => c.partyKey);
  return shipped.length > 0 && shipped.every((k) => confirmed.includes(k));
};

const partyIsConfirmed = (order, partyKey) =>
  (order.partyConfirmations || []).some((c) => c.partyKey === partyKey);

const partyHasShipped = (order, partyKey) =>
  (order.partyShipments || []).some((s) => s.partyKey === partyKey);

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL HELPERS  (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

const sendShippedEmail = async (order, buyerEmail, buyerName) => {
  try {
    const t       = makeTransporter();
    const orderId = order._id.toString().slice(-6).toUpperCase();
    await t.sendMail({
      from: `"${STORE}" <${FROM}>`,
      to:   buyerEmail,
      subject: `📦 Your order #${orderId} has been shipped!`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
          <div style="background:orangered;padding:28px 24px;border-radius:12px 12px 0 0;text-align:center">
            <h1 style="color:white;margin:0;font-size:22px">📦 On its way!</h1>
            <p style="color:rgba(255,255,255,.85);margin:6px 0 0;font-size:14px">Your order has been shipped</p>
          </div>
          <div style="background:white;padding:28px 24px;border-radius:0 0 12px 12px;border:1px solid #eee;border-top:none">
            <p style="font-size:15px;color:#222">Hi <strong>${buyerName || "there"}</strong>,</p>
            <p style="color:#555;font-size:14px;line-height:1.6">Your order has been packed and handed over for delivery.</p>
            <div style="background:#f9f9f9;border:1px solid #eee;border-radius:8px;padding:16px;margin:16px 0;font-size:14px">
              <p style="margin:4px 0"><strong>Order ID:</strong> #${orderId}</p>
              <p style="margin:4px 0"><strong>Total:</strong> ₦${order.totalAmount?.toLocaleString()}</p>
              <p style="margin:4px 0"><strong>Shipped:</strong> ${new Date().toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" })}</p>
              ${order.deliveryInfo?.city ? `<p style="margin:4px 0"><strong>To:</strong> ${order.deliveryInfo.street ? order.deliveryInfo.street + ", " : ""}${order.deliveryInfo.city}, ${order.deliveryInfo.state}</p>` : ""}
            </div>
            <p style="background:#fff8e7;border-left:4px solid orange;padding:10px 14px;border-radius:4px;font-size:13px;color:#6b4f00">
              ⚠️ When you receive your items, go to your orders page and <strong>confirm receipt for each seller</strong>. Do NOT confirm if an item is wrong or damaged — raise a dispute instead.
            </p>
            <div style="text-align:center;margin:24px 0">
              <a href="${FRONTEND}/orders" style="background:orangered;color:white;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:bold;font-size:14px;display:inline-block">View My Orders</a>
            </div>
          </div>
        </div>`,
    });
    console.log(`📧 Shipped email → ${buyerEmail}`);
  } catch (err) {
    console.error("sendShippedEmail failed:", err.message);
  }
};

const sendPartyConfirmedEmail = async ({ toEmail, toName, order, partyLabel, subtotal, commission, net }) => {
  try {
    const t       = makeTransporter();
    const orderId = order._id.toString().slice(-6).toUpperCase();
    await t.sendMail({
      from: `"${STORE}" <${FROM}>`,
      to:   toEmail,
      subject: `✅ Customer confirmed receipt — Order #${orderId}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
          <div style="background:#16a34a;padding:28px 24px;border-radius:12px 12px 0 0;text-align:center">
            <h1 style="color:white;margin:0;font-size:22px">✅ Delivery Confirmed!</h1>
            <p style="color:rgba(255,255,255,.85);margin:6px 0 0;font-size:14px">The customer has received your items</p>
          </div>
          <div style="background:white;padding:28px 24px;border-radius:0 0 12px 12px;border:1px solid #eee;border-top:none">
            <p style="font-size:15px;color:#222">Hi <strong>${toName || "there"}</strong>,</p>
            <p style="color:#555;font-size:14px;line-height:1.6">
              The customer has confirmed they received the <strong>${partyLabel}</strong> items from order <strong>#${orderId}</strong>.
            </p>
            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:16px 0;font-size:14px;color:#166534">
              <p style="margin:4px 0"><strong>Order ID:</strong> #${orderId}</p>
              ${subtotal ? `<p style="margin:4px 0"><strong>Gross sales:</strong> ₦${subtotal.toLocaleString()}</p>` : ""}
              ${commission != null ? `<p style="margin:4px 0"><strong>Platform commission:</strong> −₦${commission.toLocaleString()}</p>` : ""}
              ${net != null ? `<p style="margin:4px 0;font-weight:bold;font-size:15px"><strong>Your payout:</strong> ₦${net.toLocaleString()}</p>` : ""}
              <p style="margin:4px 0">Payment will be released to your account within 3–7 days.</p>
            </div>
          </div>
        </div>`,
    });
    console.log(`📧 Party-confirmed email → ${toEmail}`);
  } catch (err) {
    console.error("sendPartyConfirmedEmail failed:", err.message);
  }
};

const sendVendorNewOrderEmail = async ({ vendorEmail, vendorName, order, vendorItems }) => {
  try {
    const t       = makeTransporter();
    const orderId = order._id.toString().slice(-6).toUpperCase();
    const total   = vendorItems.reduce((s, i) => s + i.price * i.quantity, 0);
    const itemRows = vendorItems
      .map((i) => `<li style="margin:4px 0;font-size:14px">${i.productName || "Product"} × ${i.quantity} — ₦${(i.price * i.quantity).toLocaleString()}</li>`)
      .join("");

    await t.sendMail({
      from: `"${STORE}" <${FROM}>`,
      to:   vendorEmail,
      subject: `🛒 New order #${orderId} — action required`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
          <div style="background:#7c3aed;padding:28px 24px;border-radius:12px 12px 0 0;text-align:center">
            <h1 style="color:white;margin:0;font-size:22px">🛒 New Order!</h1>
          </div>
          <div style="background:white;padding:28px 24px;border-radius:0 0 12px 12px;border:1px solid #eee;border-top:none">
            <p>Hi <strong>${vendorName || "Vendor"}</strong>, you have a new order.</p>
            <ul style="padding-left:18px;margin:0 0 16px">${itemRows}</ul>
            <p><strong>Your items total:</strong> ₦${total.toLocaleString()}</p>
            ${order.deliveryInfo?.city ? `<p>📍 ${order.deliveryInfo.street ? order.deliveryInfo.street + ", " : ""}${order.deliveryInfo.city}, ${order.deliveryInfo.state}</p>` : ""}
          </div>
        </div>`,
    });
    console.log(`📧 Vendor new-order email → ${vendorEmail}`);
  } catch (err) {
    console.error("sendVendorNewOrderEmail failed:", err.message);
  }
};

const sendAdminNewOrderEmail = async ({ adminEmail, order, buyerName, buyerEmail }) => {
  try {
    const t       = makeTransporter();
    const orderId = order._id.toString().slice(-6).toUpperCase();
    const platformCount = (order.items || []).filter((i) => !i.vendorId).length;
    const vendorCount   = (order.items || []).filter((i) => i.vendorId).length;

    await t.sendMail({
      from: `"${STORE}" <${FROM}>`,
      to:   adminEmail,
      subject: `🔔 New order #${orderId} — ₦${order.totalAmount?.toLocaleString()}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
          <div style="background:#111;padding:28px 24px;border-radius:12px 12px 0 0;text-align:center">
            <h1 style="color:orangered;margin:0;font-size:22px">🔔 New Order</h1>
          </div>
          <div style="background:white;padding:28px 24px;border-radius:0 0 12px 12px;border:1px solid #eee;border-top:none">
            <p><strong>Order ID:</strong> #${orderId}</p>
            <p><strong>Total:</strong> ₦${order.totalAmount?.toLocaleString()}</p>
            <p><strong>Customer:</strong> ${buyerName} (${buyerEmail})</p>
            <p><strong>Platform items:</strong> ${platformCount}</p>
            <p><strong>Vendor items:</strong> ${vendorCount}</p>
          </div>
        </div>`,
    });
    console.log(`📧 Admin new-order email → ${adminEmail}`);
  } catch (err) {
    console.error("sendAdminNewOrderEmail failed:", err.message);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// CREATE ORDER
// ─────────────────────────────────────────────────────────────────────────────
export const createOrder = async (req, res) => {
  try {
    const userId = req.user.id;
    const { items } = req.body;

    if (!items || items.length === 0)
      return res.status(400).json({ message: "Cart is empty" });

    const productIds = items.map((i) => i.productId);

    const [platformProducts, vendorProducts] = await Promise.all([
      Product.find({ _id: { $in: productIds } }),
      VendorProduct.find({ _id: { $in: productIds } }),
    ]);

    const productMap = {};
    platformProducts.forEach((p) => (productMap[p._id.toString()] = { ...p._doc, source: "platform" }));
    vendorProducts.forEach((p)   => (productMap[p._id.toString()] = { ...p._doc, source: "vendor" }));

    let totalAmount = 0;
    const orderItems = [];

    for (const item of items) {
      const product = productMap[item.productId];
      if (!product) continue;
      totalAmount += product.price * item.quantity;
      orderItems.push({
        productId: item.productId,
        quantity:  item.quantity,
        price:     product.price,
        vendorId:  item.vendorId || null,
      });
    }

    if (orderItems.length === 0)
      return res.status(404).json({ message: "No valid products found" });

    const order = await Order.create({
      user: userId,
      items: orderItems,
      totalAmount,
      status: "pending",
      paymentStatus: "pending",
    });

    const buyer = await User.findById(userId).select("name email");

    const vendorItemsMap = {};
    for (const item of orderItems) {
      if (item.vendorId) {
        const vk = item.vendorId.toString();
        if (!vendorItemsMap[vk]) vendorItemsMap[vk] = [];
        vendorItemsMap[vk].push({
          ...item,
          productName: productMap[item.productId?.toString()]?.name || "Product",
        });
      }
    }

    for (const [vendorId, vItems] of Object.entries(vendorItemsMap)) {
      const vendor = await User.findById(vendorId).select("name email");
      if (vendor?.email) {
        await sendVendorNewOrderEmail({ vendorEmail: vendor.email, vendorName: vendor.name, order, vendorItems: vItems });
      }
    }

    const adminUser = await User.findOne({ role: "admin" }).select("name email");
    if (adminUser?.email) {
      await sendAdminNewOrderEmail({ adminEmail: adminUser.email, order, buyerName: buyer?.name || "Customer", buyerEmail: buyer?.email || "" });
    }

    res.status(201).json({ success: true, order });
  } catch (err) {
    console.error("Order error:", err);
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// SAVE DELIVERY INFO
// ─────────────────────────────────────────────────────────────────────────────
export const saveDeliveryInfo = async (req, res) => {
  try {
    const { fullName, phone, country, state, city, street, landmark } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (String(order.user) !== String(req.user._id))
      return res.status(403).json({ message: "Not allowed" });

    order.deliveryInfo = { fullName, phone, country, state, city, street, landmark };
    await order.save();
    return res.json({ success: true, message: "Delivery info saved", order });
  } catch (err) {
    return res.status(500).json({ message: "Failed to save delivery info" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET ALL ORDERS (admin)
// ─────────────────────────────────────────────────────────────────────────────
export const getAllOrders = async (req, res) => {
  try {
    const orders = await Order.find().populate("user", "name email").sort({ createdAt: -1 });
    res.json({ success: true, orders });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET MY ORDERS (customer)
// ─────────────────────────────────────────────────────────────────────────────
export const getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user.id }).sort({ createdAt: -1 });
    const allIds = orders.flatMap((o) => o.items.map((i) => i.productId));
    const [pp, vp] = await Promise.all([
      Product.find({ _id: { $in: allIds } }).select("name price images"),
      VendorProduct.find({ _id: { $in: allIds } }).select("name price images"),
    ]);
    const pm = {};
    pp.forEach((p) => (pm[p._id.toString()] = p));
    vp.forEach((p) => (pm[p._id.toString()] = p));
    const enriched = orders.map((o) => ({
      ...o._doc,
      items: o.items.map((i) => ({
        ...i._doc,
        productId: pm[i.productId?.toString()] || { name: "Product", price: i.price },
      })),
    }));
    res.json({ success: true, orders: enriched });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET SINGLE ORDER
// ─────────────────────────────────────────────────────────────────────────────
export const getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate("user", "name email");
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (order.user._id.toString() !== req.user.id && req.user.role !== "admin")
      return res.status(403).json({ message: "Not authorized" });
    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE ORDER STATUS (admin)
// ─────────────────────────────────────────────────────────────────────────────
export const updateOrderStatus = async (req, res) => {
  try {
    const order = await Order.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
    if (!order) return res.status(404).json({ message: "Order not found" });
    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE SINGLE ORDER (admin)
// ─────────────────────────────────────────────────────────────────────────────
export const deleteOrder = async (req, res) => {
  try {
    const order = await Order.findByIdAndDelete(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });
    res.json({ success: true, message: `Order #${order._id.toString().slice(-6).toUpperCase()} deleted` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE ALL ORDERS (admin — dangerous, requires confirmation header)
// Caller must send header: X-Confirm-Delete: DELETE_ALL_ORDERS
// ─────────────────────────────────────────────────────────────────────────────
export const deleteAllOrders = async (req, res) => {
  try {
    const confirm = req.headers["x-confirm-delete"];
    if (confirm !== "DELETE_ALL_ORDERS") {
      return res.status(400).json({
        message: "Missing or incorrect confirmation header. Send 'X-Confirm-Delete: DELETE_ALL_ORDERS'.",
      });
    }
    const result = await Order.deleteMany({});
    res.json({
      success: true,
      message: `All ${result.deletedCount} orders deleted permanently.`,
      deletedCount: result.deletedCount,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET COMMISSION SUMMARY FOR AN ORDER (admin)
// Returns a per-party breakdown: gross, commission rate, commission amount, net payout
// ─────────────────────────────────────────────────────────────────────────────
export const getOrderCommission = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    const allIds = order.items.map((i) => i.productId);
    const [pp, vp] = await Promise.all([
      Product.find({ _id: { $in: allIds } }).select("name category"),
      VendorProduct.find({ _id: { $in: allIds } }).select("name category"),
    ]);
    const pm = {};
    pp.forEach((p) => (pm[p._id.toString()] = p));
    vp.forEach((p) => (pm[p._id.toString()] = p));

    const breakdown = calcCommissionBreakdown(order.items, pm);
    const totalGross      = breakdown.reduce((s, p) => s + p.gross, 0);
    const totalCommission = breakdown.reduce((s, p) => s + p.commission, 0);
    const totalNet        = breakdown.reduce((s, p) => s + p.net, 0);

    res.json({
      success: true,
      orderId: order._id,
      totalGross,
      totalCommission,
      totalNet,
      breakdown,
      rates: COMMISSION_RATES,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET VENDOR ORDERS
// ─────────────────────────────────────────────────────────────────────────────
export const getVendorOrders = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const orders   = await Order.find({ "items.vendorId": vendorId })
      .populate("user", "name email")
      .sort({ createdAt: -1 });

    const vendorOrders = orders.map((o) => ({
      ...o._doc,
      items: o.items.filter((i) => i.vendorId?.toString() === vendorId),
    }));

    const allIds = vendorOrders.flatMap((o) => o.items.map((i) => i.productId));
    const [pp, vp] = await Promise.all([
      Product.find({ _id: { $in: allIds } }).select("name images category"),
      VendorProduct.find({ _id: { $in: allIds } }).select("name images category"),
    ]);
    const pm = {};
    pp.forEach((p) => (pm[p._id.toString()] = p));
    vp.forEach((p) => (pm[p._id.toString()] = p));

    const enriched = vendorOrders.map((o) => {
      // Compute commission for vendor's items in this order
      const breakdown = calcCommissionBreakdown(o.items, pm);
      const myParty   = breakdown.find((b) => b.partyKey === vendorId) || {};

      return {
        ...o,
        items: o.items.map((i) => ({
          ...i._doc,
          productName:  pm[i.productId?.toString()]?.name       || "Unknown Product",
          productImage: pm[i.productId?.toString()]?.images?.[0] || null,
          category:     pm[i.productId?.toString()]?.category    || null,
        })),
        commissionSummary: {
          gross:      myParty.gross      ?? 0,
          commission: myParty.commission ?? 0,
          net:        myParty.net        ?? 0,
        },
      };
    });

    res.json({ success: true, orders: enriched });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// VENDOR: MARK SHIPPED
// ─────────────────────────────────────────────────────────────────────────────
export const vendorMarkShipped = async (req, res) => {
  try {
    const order    = await Order.findById(req.params.id).populate("user", "name email");
    if (!order) return res.status(404).json({ message: "Order not found" });

    const vendorId = req.user.id;
    const hasItems = order.items.some((i) => i.vendorId?.toString() === vendorId);
    if (!hasItems) return res.status(403).json({ message: "This is not your order" });

    if (!["pending", "paid", "processing"].includes(order.status))
      return res.status(400).json({ message: "Order is not ready to ship yet" });

    if (!req.file)
      return res.status(400).json({ message: "A photo is required to ship" });

    const alreadyShipped = (order.partyShipments || []).some((s) => s.partyKey === vendorId);
    if (alreadyShipped)
      return res.status(400).json({ message: "You have already marked this order as shipped" });

    order.partyShipments = order.partyShipments || [];
    order.partyShipments.push({ partyKey: vendorId, vendorId, photo: req.file.path, shippedAt: new Date() });
    if (!order.vendorShipPhoto) order.vendorShipPhoto = req.file.path;

    if (allPartiesShipped(order)) {
      order.status = "shipped";
      order.vendorShippedAt = new Date();
      order.escrowStatus = "holding";
      if (order.user?.email) await sendShippedEmail(order, order.user.email, order.user.name);
    } else {
      if (["pending", "paid"].includes(order.status)) order.status = "processing";
    }

    await order.save();
    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: MARK PLATFORM ITEMS SHIPPED
// ─────────────────────────────────────────────────────────────────────────────
export const adminMarkShipped = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate("user", "name email");
    if (!order) return res.status(404).json({ message: "Order not found" });

    if (!["pending", "paid", "processing"].includes(order.status))
      return res.status(400).json({ message: "Order cannot be shipped in its current state" });

    if (!req.file)
      return res.status(400).json({ message: "A photo is required" });

    const hasPlatform = order.items.some((i) => !i.vendorId || i.vendorId === null);
    if (!hasPlatform)
      return res.status(400).json({ message: "This order has no platform items to ship" });

    const alreadyShipped = (order.partyShipments || []).some((s) => s.partyKey === "__platform__");
    if (alreadyShipped)
      return res.status(400).json({ message: "Platform items already marked as shipped" });

    order.partyShipments = order.partyShipments || [];
    order.partyShipments.push({ partyKey: "__platform__", vendorId: null, photo: req.file.path, shippedAt: new Date() });
    if (!order.vendorShipPhoto) order.vendorShipPhoto = req.file.path;

    if (allPartiesShipped(order)) {
      order.status = "shipped";
      order.vendorShippedAt = new Date();
      order.escrowStatus = "holding";
      if (order.user?.email) await sendShippedEmail(order, order.user.email, order.user.name);
    } else {
      if (["pending", "paid"].includes(order.status)) order.status = "processing";
    }

    await order.save();
    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOMER: CONFIRM RECEIVED (per-party)
// ─────────────────────────────────────────────────────────────────────────────
export const customerConfirmReceived = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate("user", "name email");
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (order.user._id.toString() !== req.user.id)
      return res.status(403).json({ message: "This is not your order" });

    const { partyKey, vendorId } = req.body;

    if (!partyKey)
      return res.status(400).json({ message: "partyKey is required" });

    const validKeys = getOrderPartyKeys(order);
    if (!validKeys.includes(partyKey))
      return res.status(400).json({ message: `Invalid partyKey "${partyKey}" for this order` });

    if (!partyHasShipped(order, partyKey))
      return res.status(400).json({ message: "This seller hasn't shipped their items yet." });

    if (partyIsConfirmed(order, partyKey))
      return res.status(400).json({ message: "You have already confirmed receipt for this seller's items" });

    if (!req.file)
      return res.status(400).json({ message: "A photo of the received items is required" });

    order.partyConfirmations = order.partyConfirmations || [];
    order.partyConfirmations.push({ partyKey, vendorId: vendorId || null, photo: req.file.path, confirmedAt: new Date() });
    if (!order.customerReceivePhoto) order.customerReceivePhoto = req.file.path;

    const nowAllConfirmed = allShippedPartiesConfirmed(order);

    if (nowAllConfirmed) {
      order.status              = "delivered";
      order.customerConfirmedAt = new Date();
      order.escrowStatus        = "pending_release";

      // Load product map for commission calculation
      const allIds = order.items.map((i) => i.productId);
      const [pp, vp] = await Promise.all([
        Product.find({ _id: { $in: allIds } }).select("name category"),
        VendorProduct.find({ _id: { $in: allIds } }).select("name category"),
      ]);
      const pm = {};
      pp.forEach((p) => (pm[p._id.toString()] = p));
      vp.forEach((p) => (pm[p._id.toString()] = p));
      const commBreakdown = calcCommissionBreakdown(order.items, pm);

      const adminUser = await User.findOne({ role: "admin" }).select("name email");

      for (const confirmation of order.partyConfirmations) {
        const partyComm = commBreakdown.find((b) => b.partyKey === confirmation.partyKey) || {};

        if (confirmation.partyKey === "__platform__") {
          if (adminUser?.email) {
            await sendPartyConfirmedEmail({
              toEmail:    adminUser.email,
              toName:     adminUser.name || "Admin",
              order,
              partyLabel: "Platform Store",
              subtotal:   partyComm.gross,
              commission: 0,
              net:        partyComm.gross,
            });
          }
        } else {
          const vendor = await User.findById(confirmation.partyKey).select("name email");
          if (vendor?.email) {
            await sendPartyConfirmedEmail({
              toEmail:    vendor.email,
              toName:     vendor.name || "Vendor",
              order,
              partyLabel: vendor.name || "Vendor Store",
              subtotal:   partyComm.gross,
              commission: partyComm.commission,
              net:        partyComm.net,
            });
          }
        }
      }
    }

    await order.save();

    const shippedCount   = (order.partyShipments || []).length;
    const confirmedCount = (order.partyConfirmations || []).length;
    const remaining      = shippedCount - confirmedCount;

    res.json({
      success: true,
      message: nowAllConfirmed
        ? "All deliveries confirmed! Sellers will be paid within 3–7 days."
        : `Receipt confirmed. ${remaining} more delivery${remaining !== 1 ? "ies" : ""} still to confirm.`,
      order,
      allConfirmed:   nowAllConfirmed,
      confirmedCount,
      remainingCount: remaining,
    });
  } catch (err) {
    console.error("CUSTOMER CONFIRM ERROR:", err.message);
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: RELEASE PAYMENT (per-party) — now deducts commission before recording net
// ─────────────────────────────────────────────────────────────────────────────
export const releaseVendorPayment = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    if (order.escrowStatus !== "pending_release")
      return res.status(400).json({ message: "Payment is not ready for release yet" });

    const { partyKey, vendorId, note, accountNumber } = req.body;

    if (!partyKey)
      return res.status(400).json({ message: "partyKey is required" });

    if (partyKey === "__platform__" && !accountNumber?.trim())
      return res.status(400).json({ message: "Account number is required for platform payout" });

    if (!partyIsConfirmed(order, partyKey))
      return res.status(400).json({ message: "Customer has not yet confirmed receipt for this seller's items" });

    const alreadyPaid = (order.partyPayouts || []).some((p) => p.partyKey === partyKey);
    if (alreadyPaid)
      return res.status(400).json({ message: "This party has already been paid" });

    // ── Calculate commission for this party ───────────────────────────────────
    const partyItems = order.items.filter((i) =>
      partyKey === "__platform__"
        ? !i.vendorId || i.vendorId === null
        : i.vendorId?.toString() === partyKey
    );

    const allIds = partyItems.map((i) => i.productId);
    const [pp, vp] = await Promise.all([
      Product.find({ _id: { $in: allIds } }).select("name category"),
      VendorProduct.find({ _id: { $in: allIds } }).select("name category"),
    ]);
    const pm = {};
    pp.forEach((p) => (pm[p._id.toString()] = p));
    vp.forEach((p) => (pm[p._id.toString()] = p));

    const breakdown = calcCommissionBreakdown(partyItems, pm);
    const partyComm = breakdown.find((b) => b.partyKey === partyKey) || {
      gross: partyItems.reduce((s, i) => s + i.price * i.quantity, 0),
      commission: 0,
      net: partyItems.reduce((s, i) => s + i.price * i.quantity, 0),
    };

    // ── Record payout with commission info ────────────────────────────────────
    order.partyPayouts = order.partyPayouts || [];
    order.partyPayouts.push({
      partyKey,
      vendorId:      vendorId || null,
      paidAt:        new Date(),
      note:          note || "",
      accountNumber: accountNumber?.trim() || null,
      gross:         partyComm.gross,
      commission:    partyComm.commission,
      net:           partyComm.net,
    });

    const requiredParties = getOrderPartyKeys(order);
    const paidParties     = order.partyPayouts.map((p) => p.partyKey);
    const allPaid         = requiredParties.every((k) => paidParties.includes(k));

    if (allPaid) {
      order.escrowStatus = "released";
      order.vendorPaidAt = new Date();
    }
    order.payoutNote = note || order.payoutNote;

    await order.save();
    res.json({
      success: true,
      message: allPaid ? "All parties paid — escrow fully released" : "Payout recorded. Other parties still pending.",
      order,
      commission: {
        gross:      partyComm.gross,
        commission: partyComm.commission,
        net:        partyComm.net,
      },
    });
  } catch (err) {
    console.error("RELEASE PAYMENT ERROR:", err.message);
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// RAISE DISPUTE
// ─────────────────────────────────────────────────────────────────────────────
export const raiseDispute = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (order.user.toString() !== req.user.id)
      return res.status(403).json({ message: "Not your order" });
    if (!["shipped", "processing"].includes(order.status))
      return res.status(400).json({ message: "Can only dispute shipped or partially-shipped orders" });

    order.dispute = { raised: true, reason: req.body.reason, resolved: false };
    await order.save();
    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};