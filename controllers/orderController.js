import Order from "../models/Order.js";
import Product from "../models/Product.js";
import VendorProduct from "../models/VendorProduct.js";
import User from "../models/User.js";
import VendorPlan from "../models/VendorPlan.js";
import Notification from "../models/Notification.js";
import nodemailer from "nodemailer";
import { calculateCommission, PLAN_MULTIPLIER, COMMISSION_RATES } from "../config/commissionConfig.js";
import { processReferralReward } from "./referralController.js";
import { uploadToCloudinary } from "../utils/uploadToCloudinary.js";

// ─────────────────────────────────────────────────────────────────────────────
// COMMISSION RATES (re-exported for routes that import from here directly)
// ─────────────────────────────────────────────────────────────────────────────
export { COMMISSION_RATES };

export const getCommissionRate = (category) => {
  if (!category) return COMMISSION_RATES.default;
  const key = category.toLowerCase().trim();
  return COMMISSION_RATES[key] ?? COMMISSION_RATES.default;
};

// ─────────────────────────────────────────────────────────────────────────────
// CALC COMMISSION BREAKDOWN — plan-aware (async, looks up VendorPlan)
// ─────────────────────────────────────────────────────────────────────────────
export const calcCommissionBreakdown = async (items, productMap) => {
  const parties = {};
  for (const item of items) {
    const key = item.vendorId ? item.vendorId.toString() : "__platform__";
    if (!parties[key]) {
      parties[key] = { key, isPlatform: !item.vendorId, items: [] };
    }
    parties[key].items.push(item);
  }

  const results = [];

  for (const party of Object.values(parties)) {
    let gross            = 0;
    let commissionAmount = 0;
    let vendorPlanLabel  = "basic";

    if (!party.isPlatform) {
      const planDoc = await VendorPlan.findOne({ vendorId: party.key });
      vendorPlanLabel = planDoc?.plan || "basic";
    }

    for (const item of party.items) {
      const product   = productMap[item.productId?.toString()];
      const category  = product?.category || "default";
      const lineTotal = (item.price || 0) * (item.quantity || 1);
      gross += lineTotal;

      if (!party.isPlatform) {
        const breakdown = calculateCommission(lineTotal, category, vendorPlanLabel);
        commissionAmount += breakdown.commissionAmount;
      }
    }

    results.push({
      partyKey:   party.key,
      isPlatform: party.isPlatform,
      vendorPlan: vendorPlanLabel,
      gross:      Math.round(gross),
      commission: Math.round(commissionAmount),
      net:        Math.round(gross - commissionAmount),
    });
  }

  return results;
};

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL TRANSPORTER
// ─────────────────────────────────────────────────────────────────────────────
const makeTransporter = () =>
  nodemailer.createTransport({
    host:   "smtp.gmail.com",
    port:   587,
    secure: false,
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

const STORE    = process.env.STORE_NAME   || "Marketplace";
const FROM     = process.env.GMAIL_USER;
const FRONTEND = process.env.FRONTEND_URL || "http://localhost:3000";

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
  const shipped   = (order.partyShipments    || []).map((s) => s.partyKey);
  const confirmed = (order.partyConfirmations || []).map((c) => c.partyKey);
  return shipped.length > 0 && shipped.every((k) => confirmed.includes(k));
};

const partyIsConfirmed = (order, partyKey) =>
  (order.partyConfirmations || []).some((c) => c.partyKey === partyKey);

const partyHasShipped = (order, partyKey) =>
  (order.partyShipments || []).some((s) => s.partyKey === partyKey);

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const sendShippedEmail = async (order, buyerEmail, buyerName) => {
  try {
    const t       = makeTransporter();
    const orderId = order._id.toString().slice(-6).toUpperCase();
    await t.sendMail({
      from:    `"${STORE}" <${FROM}>`,
      to:      buyerEmail,
      subject: `📦 Your order #${orderId} has been shipped!`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
          <div style="background:orangered;padding:28px 24px;border-radius:12px 12px 0 0;text-align:center">
            <h1 style="color:white;margin:0;font-size:22px">📦 On its way!</h1>
          </div>
          <div style="background:white;padding:28px 24px;border-radius:0 0 12px 12px;border:1px solid #eee;border-top:none">
            <p>Hi <strong>${buyerName || "there"}</strong>, your order has been shipped.</p>
            <p><strong>Order ID:</strong> #${orderId}</p>
            <p><strong>Total:</strong> ₦${order.totalAmount?.toLocaleString()}</p>
            <p style="background:#fff8e7;border-left:4px solid orange;padding:10px 14px;font-size:13px">
              ⚠️ When you receive your items, confirm receipt in your orders page.
              Do NOT confirm if an item is wrong or damaged — raise a dispute instead.
            </p>
            <div style="text-align:center;margin:24px 0">
              <a href="${FRONTEND}/orders" style="background:orangered;color:white;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:bold;display:inline-block">View My Orders</a>
            </div>
          </div>
        </div>`,
    });
  } catch (err) {
    console.error("sendShippedEmail failed:", err.message);
  }
};

const sendPartyConfirmedEmail = async ({ toEmail, toName, order, partyLabel, subtotal, commission, net, vendorPlan }) => {
  try {
    const t       = makeTransporter();
    const orderId = order._id.toString().slice(-6).toUpperCase();
    await t.sendMail({
      from:    `"${STORE}" <${FROM}>`,
      to:      toEmail,
      subject: `✅ Customer confirmed receipt — Order #${orderId}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
          <div style="background:#16a34a;padding:28px 24px;border-radius:12px 12px 0 0;text-align:center">
            <h1 style="color:white;margin:0;font-size:22px">✅ Delivery Confirmed!</h1>
          </div>
          <div style="background:white;padding:28px 24px;border-radius:0 0 12px 12px;border:1px solid #eee;border-top:none">
            <p>Hi <strong>${toName || "there"}</strong>,</p>
            <p>Customer confirmed receipt of <strong>${partyLabel}</strong> from order <strong>#${orderId}</strong>.</p>
            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;font-size:14px;color:#166534">
              <p><strong>Plan:</strong> ${vendorPlan?.toUpperCase() || "BASIC"}</p>
              ${subtotal   != null ? `<p><strong>Gross:</strong> ₦${subtotal.toLocaleString()}</p>`                   : ""}
              ${commission != null ? `<p><strong>Commission deducted:</strong> −₦${commission.toLocaleString()}</p>`  : ""}
              ${net        != null ? `<p><strong>Your payout:</strong> ₦${net.toLocaleString()}</p>`                  : ""}
              <p>Payment released to your account within 3–7 business days.</p>
            </div>
          </div>
        </div>`,
    });
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
      .map((i) => `<li>${i.productName || "Product"} × ${i.quantity} — ₦${(i.price * i.quantity).toLocaleString()}</li>`)
      .join("");
    await t.sendMail({
      from:    `"${STORE}" <${FROM}>`,
      to:      vendorEmail,
      subject: `🛒 New order #${orderId} — action required`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
          <div style="background:#7c3aed;padding:28px 24px;border-radius:12px 12px 0 0;text-align:center">
            <h1 style="color:white;margin:0">🛒 New Order!</h1>
          </div>
          <div style="background:white;padding:28px 24px;border-radius:0 0 12px 12px;border:1px solid #eee;border-top:none">
            <p>Hi <strong>${vendorName || "Vendor"}</strong>, you have a new order.</p>
            <ul>${itemRows}</ul>
            <p><strong>Your items total:</strong> ₦${total.toLocaleString()}</p>
            ${order.deliveryInfo?.city ? `<p>📍 ${order.deliveryInfo.street ? order.deliveryInfo.street + ", " : ""}${order.deliveryInfo.city}, ${order.deliveryInfo.state}</p>` : ""}
          </div>
        </div>`,
    });
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
      from:    `"${STORE}" <${FROM}>`,
      to:      adminEmail,
      subject: `🔔 New order #${orderId} — ₦${order.totalAmount?.toLocaleString()}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
          <div style="background:#111;padding:28px 24px;border-radius:12px 12px 0 0;text-align:center">
            <h1 style="color:orangered;margin:0">🔔 New Order</h1>
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
  } catch (err) {
    console.error("sendAdminNewOrderEmail failed:", err.message);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// CREATE ORDER — response sent immediately after Order.create();
// notification + all emails run afterward in the background so the customer's
// "Proceed to Checkout" click is never blocked by slow/timing-out SMTP calls.
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
        productId:   item.productId,
        quantity:    item.quantity,
        price:       product.price,
        vendorId:    item.vendorId || null,
        productName: product.name || null,
      });
    }

    if (orderItems.length === 0)
      return res.status(404).json({ message: "No valid products found" });

    const order = await Order.create({
      user:          userId,
      items:         orderItems,
      totalAmount,
      status:        "pending",
      paymentStatus: "pending",
    });

    // ── RESPOND IMMEDIATELY — customer does not wait on notifications/emails ──
    res.status(201).json({ success: true, order });

    // ── BACKGROUND WORK (fire-and-forget, runs after response is already sent) ──
    setImmediate(async () => {
      try {
        const buyer = await User.findById(userId).select("name email");

        await Notification.create({
          userId:  userId,
          type:    "order_placed",
          title:   "Order placed successfully 🛒",
          message: `Your order #${order._id.toString().slice(-6).toUpperCase()} has been placed. Total: ₦${totalAmount.toLocaleString()}.`,
          orderId: order._id,
        });

        // Notify each vendor — run in parallel instead of one-by-one
        const vendorItemsMap = {};
        for (const item of orderItems) {
          if (item.vendorId) {
            const vk = item.vendorId.toString();
            if (!vendorItemsMap[vk]) vendorItemsMap[vk] = [];
            vendorItemsMap[vk].push(item);
          }
        }

        await Promise.allSettled(
          Object.entries(vendorItemsMap).map(async ([vendorId, vItems]) => {
            const vendor = await User.findById(vendorId).select("name email");
            if (vendor?.email) {
              await sendVendorNewOrderEmail({ vendorEmail: vendor.email, vendorName: vendor.name, order, vendorItems: vItems });
            }
          })
        );

        const adminUser = await User.findOne({ role: "admin" }).select("name email");
        if (adminUser?.email) {
          await sendAdminNewOrderEmail({ adminEmail: adminUser.email, order, buyerName: buyer?.name || "Customer", buyerEmail: buyer?.email || "" });
        }
      } catch (bgErr) {
        console.error("Order background tasks failed:", bgErr.message);
      }
    });

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
    if (String(order.user) !== String(req.user.id))
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
        productId: pm[i.productId?.toString()] || { name: i.productName || "Product", price: i.price },
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
// DELETE ALL ORDERS (admin)
// ─────────────────────────────────────────────────────────────────────────────
export const deleteAllOrders = async (req, res) => {
  try {
    const confirm = req.headers["x-confirm-delete"];
    if (confirm !== "DELETE_ALL_ORDERS") {
      return res.status(400).json({ message: "Send header 'X-Confirm-Delete: DELETE_ALL_ORDERS' to confirm." });
    }
    const result = await Order.deleteMany({});
    res.json({ success: true, message: `All ${result.deletedCount} orders deleted.`, deletedCount: result.deletedCount });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET COMMISSION SUMMARY (admin)
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

    const breakdown       = await calcCommissionBreakdown(order.items, pm);
    const totalGross      = breakdown.reduce((s, p) => s + p.gross, 0);
    const totalCommission = breakdown.reduce((s, p) => s + p.commission, 0);
    const totalNet        = breakdown.reduce((s, p) => s + p.net, 0);

    res.json({ success: true, orderId: order._id, totalGross, totalCommission, totalNet, breakdown, rates: COMMISSION_RATES });
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

    const enriched = await Promise.all(
      vendorOrders.map(async (o) => {
        const breakdown = await calcCommissionBreakdown(o.items, pm);
        const myParty   = breakdown.find((b) => b.partyKey === vendorId) || {};
        return {
          ...o,
          items: o.items.map((i) => ({
            ...i._doc,
            productName:  pm[i.productId?.toString()]?.name        || i.productName || "Unknown Product",
            productImage: pm[i.productId?.toString()]?.images?.[0] || null,
            category:     pm[i.productId?.toString()]?.category    || null,
          })),
          commissionSummary: {
            vendorPlan: myParty.vendorPlan || "basic",
            gross:      myParty.gross      ?? 0,
            commission: myParty.commission ?? 0,
            net:        myParty.net        ?? 0,
          },
        };
      })
    );

    res.json({ success: true, orders: enriched });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// VENDOR: MARK SHIPPED
// ── FIXED: response now sent immediately after order.save(); notification
// creation + the shipped-email (SMTP, slow) now run afterward in the
// background so the vendor's "Confirm & Ship" tap isn't blocked on Gmail. ──
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

    // ── CLOUDINARY: has to stay in the request path — we need the URL before saving ──
    const uploadResult = await uploadToCloudinary(req.file.buffer, { folder: "orders/shipments" });
    const photoUrl = uploadResult.secure_url;

    order.partyShipments = order.partyShipments || [];
    order.partyShipments.push({ partyKey: vendorId, vendorId, photo: photoUrl, shippedAt: new Date() });
    if (!order.vendorShipPhoto) order.vendorShipPhoto = photoUrl;

    const justCompletedShipping = allPartiesShipped(order);
    let vendorNameForNotif = null;

    if (justCompletedShipping) {
      order.status          = "shipped";
      order.vendorShippedAt = new Date();
      order.escrowStatus    = "holding";
    } else {
      if (["pending", "paid"].includes(order.status)) order.status = "processing";
      // fetched now (cheap) so the background block doesn't need to re-query
      const vendor = await User.findById(vendorId).select("name");
      vendorNameForNotif = vendor?.name || "a seller";
    }

    await order.save();

    // ── RESPOND IMMEDIATELY — vendor does not wait on notification/email ──
    res.json({ success: true, order });

    // ── BACKGROUND WORK (fire-and-forget, runs after response is already sent) ──
    setImmediate(async () => {
      try {
        if (justCompletedShipping) {
          await Notification.create({
            userId:  order.user._id,
            type:    "order_shipped",
            title:   "Your order is on its way! 📦",
            message: `Your order #${order._id.toString().slice(-6).toUpperCase()} has been shipped. Confirm receipt once your items arrive.`,
            orderId: order._id,
          });

          if (order.user?.email) await sendShippedEmail(order, order.user.email, order.user.name);
        } else {
          await Notification.create({
            userId:  order.user._id,
            type:    "order_shipped",
            title:   "Some of your items have shipped 📦",
            message: `Items from ${vendorNameForNotif} in order #${order._id.toString().slice(-6).toUpperCase()} are on their way. Waiting for remaining sellers to ship.`,
            orderId: order._id,
          });
        }
      } catch (bgErr) {
        console.error("vendorMarkShipped background tasks failed:", bgErr.message);
      }
    });
  } catch (err) {
    console.error("vendorMarkShipped error:", err);
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: MARK PLATFORM ITEMS SHIPPED
// ── FIXED: same pattern as vendorMarkShipped — respond immediately, run
// notification + email in the background. ──
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

    // ── CLOUDINARY: has to stay in the request path — we need the URL before saving ──
    const uploadResult = await uploadToCloudinary(req.file.buffer, { folder: "orders/shipments" });
    const photoUrl = uploadResult.secure_url;

    order.partyShipments = order.partyShipments || [];
    order.partyShipments.push({ partyKey: "__platform__", vendorId: null, photo: photoUrl, shippedAt: new Date() });
    if (!order.vendorShipPhoto) order.vendorShipPhoto = photoUrl;

    const justCompletedShipping = allPartiesShipped(order);

    if (justCompletedShipping) {
      order.status          = "shipped";
      order.vendorShippedAt = new Date();
      order.escrowStatus    = "holding";
    } else {
      if (["pending", "paid"].includes(order.status)) order.status = "processing";
    }

    await order.save();

    // ── RESPOND IMMEDIATELY — admin does not wait on notification/email ──
    res.json({ success: true, order });

    // ── BACKGROUND WORK (fire-and-forget, runs after response is already sent) ──
    setImmediate(async () => {
      try {
        if (justCompletedShipping) {
          await Notification.create({
            userId:  order.user._id,
            type:    "order_shipped",
            title:   "Your order is on its way! 📦",
            message: `Your order #${order._id.toString().slice(-6).toUpperCase()} has been fully shipped. Confirm receipt once your items arrive.`,
            orderId: order._id,
          });

          if (order.user?.email) await sendShippedEmail(order, order.user.email, order.user.name);
        } else {
          await Notification.create({
            userId:  order.user._id,
            type:    "order_shipped",
            title:   "Some of your items have shipped 📦",
            message: `Platform items from order #${order._id.toString().slice(-6).toUpperCase()} are on their way. Waiting for remaining sellers to ship.`,
            orderId: order._id,
          });
        }
      } catch (bgErr) {
        console.error("adminMarkShipped background tasks failed:", bgErr.message);
      }
    });
  } catch (err) {
    console.error("adminMarkShipped error:", err);
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOMER: CONFIRM RECEIVED (per-party)
// ── This is where processReferralReward is triggered ─────────────────────────
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

    // ── CLOUDINARY: upload the memory-buffer photo instead of using a local path ──
    const uploadResult = await uploadToCloudinary(req.file.buffer, { folder: "orders/receipts" });
    const photoUrl = uploadResult.secure_url;

    order.partyConfirmations = order.partyConfirmations || [];
    order.partyConfirmations.push({
      partyKey,
      vendorId:    vendorId || null,
      photo:       photoUrl,
      confirmedAt: new Date(),
    });
    if (!order.customerReceivePhoto) order.customerReceivePhoto = photoUrl;

    const nowAllConfirmed = allShippedPartiesConfirmed(order);

    if (nowAllConfirmed) {
      order.status              = "delivered";
      order.customerConfirmedAt = new Date();
      order.escrowStatus        = "pending_release";
    }

    await order.save();

    const shippedCount   = (order.partyShipments    || []).length;
    const confirmedCount = (order.partyConfirmations || []).length;
    const remaining      = shippedCount - confirmedCount;

    // ── RESPOND IMMEDIATELY — customer does not wait on referral reward,
    // notification, commission calc, or the per-vendor email loop ──
    res.json({
      success: true,
      message: nowAllConfirmed
        ? "All deliveries confirmed! Sellers will be paid within 3–7 days."
        : `Receipt confirmed. ${remaining} more deliver${remaining !== 1 ? "ies" : "y"} still to confirm.`,
      order,
      allConfirmed:   nowAllConfirmed,
      confirmedCount,
      remainingCount: remaining,
    });

    // ── BACKGROUND WORK (fire-and-forget, runs after response is already sent) ──
    if (nowAllConfirmed) {
      setImmediate(async () => {
        try {
          // ── REFERRAL REWARD HOOK ──────────────────────────────────────────
          console.log(
            `[Order] All parties confirmed for order ${order._id} — triggering referral reward | user: ${order.user?._id}`
          );
          await processReferralReward(order);
          console.log(`[Order] processReferralReward returned for order ${order._id}`);
          // ───────────────────────────────────────────────────────────────────

          // Notify buyer — full delivery confirmed
          await Notification.create({
            userId:  order.user._id,
            type:    "order_delivered",
            title:   "Order fully delivered ✅",
            message: `You've confirmed all items from order #${order._id.toString().slice(-6).toUpperCase()}. Payment will be released to the seller(s) within 3–7 business days.`,
            orderId: order._id,
          });

          const allIds = order.items.map((i) => i.productId);
          const [pp, vp] = await Promise.all([
            Product.find({ _id: { $in: allIds } }).select("name category"),
            VendorProduct.find({ _id: { $in: allIds } }).select("name category"),
          ]);
          const pm = {};
          pp.forEach((p) => (pm[p._id.toString()] = p));
          vp.forEach((p) => (pm[p._id.toString()] = p));

          const commBreakdown = await calcCommissionBreakdown(order.items, pm);
          const adminUser     = await User.findOne({ role: "admin" }).select("name email");

          // Emails to each party — run in parallel instead of one-by-one
          await Promise.allSettled(
            order.partyConfirmations.map(async (confirmation) => {
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
                    vendorPlan: "platform",
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
                    vendorPlan: partyComm.vendorPlan,
                  });
                }
              }
            })
          );
        } catch (bgErr) {
          console.error("customerConfirmReceived background tasks failed:", bgErr.message);
        }
      });
    }
  } catch (err) {
    console.error("CUSTOMER CONFIRM ERROR:", err.message);
    console.error("CUSTOMER CONFIRM STACK:", err.stack);
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: RELEASE PAYMENT
// ─────────────────────────────────────────────────────────────────────────────
export const releaseVendorPayment = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    if (order.escrowStatus !== "pending_release")
      return res.status(400).json({ message: "Payment is not ready for release yet" });

    const { partyKey, vendorId, note, accountNumber, bankCode, bankName, accountName } = req.body;

    if (!partyKey)
      return res.status(400).json({ message: "partyKey is required" });

    if (partyKey === "__platform__") {
      if (!accountNumber?.trim())
        return res.status(400).json({ message: "Account number is required for platform payout" });
      if (!bankCode?.trim())
        return res.status(400).json({ message: "Bank code is required for platform payout" });
      if (!accountName?.trim())
        return res.status(400).json({ message: "Account must be verified before releasing payment" });
    }

    if (!partyIsConfirmed(order, partyKey))
      return res.status(400).json({ message: "Customer has not yet confirmed receipt for this seller's items" });

    const alreadyPaid = (order.partyPayouts || []).some((p) => p.partyKey === partyKey);
    if (alreadyPaid)
      return res.status(400).json({ message: "This party has already been paid" });

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

    let vendorPlanLabel  = "basic";
    let totalGross       = 0;
    let totalCommission  = 0;
    let avgBaseRate      = 0;
    let avgEffectiveRate = 0;

    if (partyKey !== "__platform__") {
      const planDoc = await VendorPlan.findOne({ vendorId: partyKey });
      vendorPlanLabel = planDoc?.plan || "basic";

      for (const item of partyItems) {
        const product   = pm[item.productId?.toString()];
        const category  = product?.category || "default";
        const lineTotal = item.price * item.quantity;
        const breakdown = calculateCommission(lineTotal, category, vendorPlanLabel);
        totalGross       += lineTotal;
        totalCommission  += breakdown.commissionAmount;
        avgBaseRate      += breakdown.baseRate;
        avgEffectiveRate += breakdown.effectiveRate;
      }

      if (partyItems.length > 0) {
        avgBaseRate      = parseFloat((avgBaseRate      / partyItems.length).toFixed(4));
        avgEffectiveRate = parseFloat((avgEffectiveRate / partyItems.length).toFixed(4));
      }
    } else {
      totalGross      = partyItems.reduce((s, i) => s + i.price * i.quantity, 0);
      totalCommission = 0;
    }

    const totalNet = totalGross - totalCommission;

    order.partyPayouts = order.partyPayouts || [];
    order.partyPayouts.push({
      partyKey,
      vendorId:         vendorId || null,
      paidAt:           new Date(),
      note:             note || "",
      accountNumber:    accountNumber?.trim()  || null,
      accountName:      accountName?.trim()    || null,
      bankCode:         bankCode?.trim()       || null,
      bankName:         bankName?.trim()       || null,
      vendorPlan:       vendorPlanLabel,
      baseRate:         avgBaseRate,
      planMultiplier:   PLAN_MULTIPLIER[vendorPlanLabel] ?? 1,
      effectiveRate:    avgEffectiveRate,
      gross:            Math.round(totalGross),
      commissionAmount: Math.round(totalCommission),
      net:              Math.round(totalNet),
    });

    const requiredParties = getOrderPartyKeys(order);
    const paidParties     = order.partyPayouts.map((p) => p.partyKey);
    const allPaid         = requiredParties.every((k) => paidParties.includes(k));

    if (allPaid) {
      order.escrowStatus = "released";
      order.vendorPaidAt = new Date();

      await Notification.create({
        userId:  order.user,
        type:    "payment_released",
        title:   "Payment released to seller 💰",
        message: `Payment for your order #${order._id.toString().slice(-6).toUpperCase()} has been released to the seller(s). Thank you for shopping with us!`,
        orderId: order._id,
      });
    }

    order.payoutNote = note || order.payoutNote;
    await order.save();

    res.json({
      success: true,
      message: allPaid
        ? "All parties paid — escrow fully released"
        : "Payout recorded. Other parties still pending.",
      order,
      commissionBreakdown: {
        vendorPlan:       vendorPlanLabel,
        gross:            Math.round(totalGross),
        commissionAmount: Math.round(totalCommission),
        net:              Math.round(totalNet),
        effectiveRate:    avgEffectiveRate,
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