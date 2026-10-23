const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("node:crypto");
const path = require("node:path");
const fs = require("node:fs");
const multer = require("multer");
const mongoose = require("mongoose");
const User = require("../models/User");
const Product = require("../models/Product");
const Order = require("../models/Order");
const Review = require("../models/Review");
const { authenticate, requireRole } = require("../middleware/auth");

const router = express.Router();
const categories = ["Electronics", "Fashion", "Home & Living", "Books", "Accessories"];
const phonePattern = /^[6-9]\d{9}$/;
const uploadDir = path.resolve(process.env.UPLOAD_DIR || "uploads");
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({ destination: uploadDir, filename: (_req, file, done) => done(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`) }),
  limits: { fileSize: 5 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, done) => ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype) ? done(null, true) : done(Object.assign(new Error("Only JPG, PNG, or WebP images are accepted."), { status: 400 }))
});

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role, storeName: user.storeName || "", storeDescription: user.storeDescription || "", approved: user.approved, addresses: user.addresses || [] };
}

function validatePassword(password) {
  return typeof password === "string" && password.length >= 8 && password.length <= 72;
}

function issueSession(user, res) {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) throw Object.assign(new Error("Configure a random JWT_SECRET of at least 32 characters before enabling authentication."), { status: 503 });
  const token = jwt.sign({ sub: user.id, role: user.role, tv: user.tokenVersion }, process.env.JWT_SECRET, { expiresIn: "7d" });
  res.cookie("nexora_session", token, { httpOnly: true, secure: process.env.COOKIE_SECURE === "true", sameSite: "lax", maxAge: 7 * 24 * 60 * 60 * 1000, path: "/" });
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function productInput(body) {
  const price = Number(body.price);
  const discount = Number(body.discount || 0);
  const stock = Number(body.stock);
  if (!body.name?.trim() || body.name.trim().length < 3 || !body.description?.trim() || body.description.trim().length < 10) throw Object.assign(new Error("Enter a product name and a description of at least 10 characters."), { status: 400 });
  if (!categories.includes(body.category) || !Number.isFinite(price) || price < 1 || !Number.isFinite(discount) || discount < 0 || discount > 90 || !Number.isInteger(stock) || stock < 0) throw Object.assign(new Error("Check the category, price, discount, and stock values."), { status: 400 });
  return { name: body.name.trim(), description: body.description.trim(), category: body.category, price, discount, stock };
}

router.get("/health", (_req, res) => res.json({ ok: true, database: mongoose.connection.readyState === 1 ? "connected" : "unavailable", mode: mongoose.connection.readyState === 1 ? "database" : "demo" }));

router.post("/auth/register", asyncRoute(async (req, res) => {
  const { name, email, phone, password, role = "customer", storeName } = req.body;
  if (!name?.trim() || name.trim().length < 2 || !/^\S+@\S+\.\S+$/.test(email || "") || !phonePattern.test(phone || "") || !validatePassword(password)) return res.status(400).json({ error: "Enter a name, valid email, 10-digit Indian phone, and password with at least 8 characters." });
  if (!["customer", "seller"].includes(role)) return res.status(400).json({ error: "Choose a valid account type." });
  if (role === "seller" && !storeName?.trim()) return res.status(400).json({ error: "Store name is required for seller registration." });
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) return res.status(503).json({ error: "Configure a random JWT_SECRET of at least 32 characters before enabling authentication." });
  const user = await User.create({ name: name.trim(), email: email.toLowerCase().trim(), phone, passwordHash: password, role, storeName: role === "seller" ? storeName.trim() : undefined });
  issueSession(user, res);
  res.status(201).json({ user: publicUser(user) });
}));

router.post("/auth/login", asyncRoute(async (req, res) => {
  const { email, password, role } = req.body;
  const user = await User.findOne({ email: String(email || "").toLowerCase().trim() }).select("+passwordHash");
  if (!user || !(await user.verifyPassword(password || "")) || (role && user.role !== role)) return res.status(401).json({ error: "Email, password, or account type is incorrect." });
  issueSession(user, res);
  res.json({ user: publicUser(user) });
}));

router.post("/auth/logout", asyncRoute(async (req, res) => {
  const token = req.cookies.nexora_session;
  if (token && process.env.JWT_SECRET) {
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      await User.updateOne({ _id: payload.sub, tokenVersion: payload.tv }, { $inc: { tokenVersion: 1 } });
    } catch {}
  }
  res.clearCookie("nexora_session", { httpOnly: true, secure: process.env.COOKIE_SECURE === "true", sameSite: "lax", path: "/" });
  res.json({ ok: true });
}));
router.get("/auth/me", authenticate, (req, res) => res.json({ user: publicUser(req.user) }));

router.get("/products", asyncRoute(async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(24, Math.max(1, Number.parseInt(req.query.limit, 10) || 12));
  const filter = { status: "active" };
  if (categories.includes(req.query.category)) filter.category = req.query.category;
  if (req.query.q) filter.$text = { $search: String(req.query.q).slice(0, 100) };
  if (Number.isFinite(Number(req.query.minPrice)) || Number.isFinite(Number(req.query.maxPrice))) filter.price = { ...(req.query.minPrice ? { $gte: Number(req.query.minPrice) } : {}), ...(req.query.maxPrice ? { $lte: Number(req.query.maxPrice) } : {}) };
  if (req.query.rating) filter.averageRating = { $gte: Math.min(5, Math.max(0, Number(req.query.rating))) };
  const sorts = { price: { price: 1 }, "price-desc": { price: -1 }, newest: { createdAt: -1 }, rating: { averageRating: -1 }, popularity: { soldCount: -1 } };
  const [items, total] = await Promise.all([Product.find(filter).populate("seller", "storeName").sort(sorts[req.query.sort] || { createdAt: -1 }).skip((page - 1) * limit).limit(limit), Product.countDocuments(filter)]);
  res.json({ items, page, limit, total, pages: Math.ceil(total / limit) });
}));

router.get("/products/:id", asyncRoute(async (req, res) => {
  const product = await Product.findOne({ _id: req.params.id, status: "active" }).populate("seller", "storeName");
  if (!product) return res.status(404).json({ error: "Product not found." });
  const reviews = await Review.find({ product: product.id }).populate("customer", "name").sort({ createdAt: -1 }).limit(20);
  res.json({ product, reviews });
}));

router.get("/profile", authenticate, requireRole("customer"), (req, res) => res.json({ user: publicUser(req.user) }));
router.patch("/profile", authenticate, requireRole("customer"), asyncRoute(async (req, res) => {
  const { name, phone } = req.body;
  if (name !== undefined && (typeof name !== "string" || name.trim().length < 2)) return res.status(400).json({ error: "Name must contain at least 2 characters." });
  if (phone !== undefined && !phonePattern.test(phone)) return res.status(400).json({ error: "Enter a valid 10-digit Indian phone number." });
  if (name !== undefined) req.user.name = name.trim();
  if (phone !== undefined) req.user.phone = phone;
  await req.user.save();
  res.json({ user: publicUser(req.user) });
}));
router.post("/profile/addresses", authenticate, requireRole("customer"), asyncRoute(async (req, res) => {
  const { name, phone, house, city, state, pin } = req.body;
  if (!name?.trim() || !phonePattern.test(phone || "") || !house?.trim() || !city?.trim() || !state?.trim() || !/^\d{6}$/.test(pin || "")) return res.status(400).json({ error: "Complete the address and enter a valid Indian phone number and 6-digit PIN code." });
  req.user.addresses.push({ name: name.trim(), phone, house: house.trim(), city: city.trim(), state: state.trim(), pin });
  await req.user.save();
  res.status(201).json({ addresses: req.user.addresses });
}));

router.get("/wishlist", authenticate, requireRole("customer"), asyncRoute(async (req, res) => {
  const user = await User.findById(req.user.id).populate({ path: "wishlist", match: { status: "active" }, populate: { path: "seller", select: "storeName" } });
  res.json({ items: user.wishlist });
}));
router.post("/wishlist/:productId", authenticate, requireRole("customer"), asyncRoute(async (req, res) => {
  if (!await Product.exists({ _id: req.params.productId, status: "active" })) return res.status(404).json({ error: "Product not found." });
  await User.updateOne({ _id: req.user.id }, { $addToSet: { wishlist: req.params.productId } });
  res.json({ ok: true });
}));
router.delete("/wishlist/:productId", authenticate, requireRole("customer"), asyncRoute(async (req, res) => { await User.updateOne({ _id: req.user.id }, { $pull: { wishlist: req.params.productId } }); res.json({ ok: true }); }));

router.post("/orders", authenticate, requireRole("customer"), asyncRoute(async (req, res) => {
  const { items, address, paymentMethod = "cod" } = req.body;
  if (!Array.isArray(items) || !items.length || paymentMethod !== "cod") return res.status(400).json({ error: "Provide cart items and select Cash on Delivery." });
  if (!address || !address.name?.trim() || !phonePattern.test(address.phone || "") || !address.house?.trim() || !address.city?.trim() || !address.state?.trim() || !/^\d{6}$/.test(address.pin || "")) return res.status(400).json({ error: "Enter a complete Indian shipping address." });
  const session = await mongoose.startSession();
  let createdOrder;
  try {
    await session.withTransaction(async () => {
      const normalized = new Map();
      for (const item of items) {
        const quantity = Number(item.quantity);
        if (!mongoose.isValidObjectId(item.productId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 100) throw Object.assign(new Error("Cart contains an invalid product or quantity."), { status: 400 });
        normalized.set(item.productId, (normalized.get(item.productId) || 0) + quantity);
      }
      const productIds = [...normalized.keys()];
      const products = await Product.find({ _id: { $in: productIds }, status: "active" }).session(session);
      if (products.length !== productIds.length) throw Object.assign(new Error("One or more products are no longer available."), { status: 409 });
      const orderItems = [];
      let subtotal = 0;
      let discountTotal = 0;
      for (const product of products) {
        const quantity = normalized.get(product.id);
        const stockUpdate = await Product.updateOne({ _id: product.id, status: "active", stock: { $gte: quantity } }, { $inc: { stock: -quantity, soldCount: quantity } }, { session });
        if (stockUpdate.modifiedCount !== 1) throw Object.assign(new Error(`${product.name} does not have enough stock.`), { status: 409 });
        const unitPrice = Math.round(product.price * (100 - product.discount) / 100);
        subtotal += unitPrice * quantity;
        discountTotal += Math.round(product.price * product.discount) * quantity;
        orderItems.push({ product: product.id, seller: product.seller, name: product.name, image: product.images[0] || "", quantity, unitPrice, discount: product.discount });
      }
      const deliveryFee = subtotal >= 999 ? 0 : 49;
      const order = new Order({ reference: `NX-${crypto.randomBytes(4).toString("hex").toUpperCase()}`, customer: req.user.id, items: orderItems, address, paymentMethod: "cod", subtotal, deliveryFee, discountTotal, total: subtotal + deliveryFee });
      createdOrder = await order.save({ session });
    });
  } finally {
    await session.endSession();
  }
  res.status(201).json({ order: createdOrder });
}));
router.get("/orders", authenticate, requireRole("customer"), asyncRoute(async (req, res) => {
  const orders = await Order.find({ customer: req.user.id }).sort({ createdAt: -1 });
  res.json({ items: orders });
}));
router.get("/orders/:id", authenticate, requireRole("customer"), asyncRoute(async (req, res) => {
  const order = await Order.findOne({ _id: req.params.id, customer: req.user.id });
  if (!order) return res.status(404).json({ error: "Order not found." });
  res.json({ order });
}));
router.post("/orders/:id/cancel", authenticate, requireRole("customer"), asyncRoute(async (req, res) => {
  const session = await mongoose.startSession();
  let order;
  try {
    await session.withTransaction(async () => {
      order = await Order.findOne({ _id: req.params.id, customer: req.user.id }).session(session);
      if (!order) throw Object.assign(new Error("Order not found."), { status: 404 });
      if (!order.items.every(item => ["Pending", "Confirmed"].includes(item.status))) throw Object.assign(new Error("Orders can only be cancelled before any item ships."), { status: 409 });
      for (const item of order.items) await Product.updateOne({ _id: item.product }, { $inc: { stock: item.quantity, soldCount: -item.quantity } }, { session });
      order.items.forEach(item => { item.status = "Cancelled"; });
      order.status = "Cancelled";
      await order.save({ session });
    });
  } finally { await session.endSession(); }
  res.json({ order });
}));

router.post("/reviews", authenticate, requireRole("customer"), asyncRoute(async (req, res) => {
  const { productId, orderId, rating, text = "" } = req.body;
  if (!mongoose.isValidObjectId(productId) || !mongoose.isValidObjectId(orderId) || !Number.isInteger(Number(rating)) || rating < 1 || rating > 5) return res.status(400).json({ error: "Provide a valid order, product, and 1–5 star rating." });
  const order = await Order.findOne({ _id: orderId, customer: req.user.id, status: "Delivered", "items.product": productId });
  if (!order) return res.status(403).json({ error: "Reviews are available only for delivered purchases." });
  const review = await Review.create({ product: productId, customer: req.user.id, order: orderId, rating: Number(rating), text: String(text).slice(0, 1200) });
  const stats = await Review.aggregate([{ $match: { product: new mongoose.Types.ObjectId(productId) } }, { $group: { _id: "$product", average: { $avg: "$rating" }, count: { $sum: 1 } } }]);
  await Product.updateOne({ _id: productId }, { averageRating: stats[0].average, reviewCount: stats[0].count });
  res.status(201).json({ review });
}));

router.get("/seller/dashboard", authenticate, requireRole("seller"), asyncRoute(async (req, res) => {
  const [products, orders, metrics] = await Promise.all([
    Product.find({ seller: req.user.id }).sort({ createdAt: -1 }),
    Order.find({ "items.seller": req.user.id }).sort({ createdAt: -1 }).limit(10),
    Order.aggregate([
      { $match: { "items.seller": req.user._id } },
      { $unwind: "$items" },
      { $match: { "items.seller": req.user._id } },
      { $group: {
        _id: null,
        orderIds: { $addToSet: { $cond: [{ $ne: ["$status", "Cancelled"] }, "$_id", null] } },
        unitsSold: { $sum: { $cond: [{ $ne: ["$status", "Cancelled"] }, "$items.quantity", 0] } },
        grossSales: { $sum: { $cond: [{ $ne: ["$status", "Cancelled"] }, { $multiply: ["$items.unitPrice", "$items.quantity"] }, 0] } }
      } }
    ])
  ]);
  const totals = metrics[0] || { orderIds: [], unitsSold: 0, grossSales: 0 };
  const orderCount = totals.orderIds.filter(Boolean).length;
  res.json({ stats: { products: products.length, activeListings: products.filter(item => item.status === "active").length, orders: orderCount, unitsSold: totals.unitsSold, grossSales: totals.grossSales }, lowStock: products.filter(product => product.stock < 5), products, orders });
}));
router.get("/seller/products", authenticate, requireRole("seller"), asyncRoute(async (req, res) => res.json({ items: await Product.find({ seller: req.user.id }).sort({ createdAt: -1 }) })));
router.post("/seller/products", authenticate, requireRole("seller"), upload.array("images", 5), asyncRoute(async (req, res) => {
  const data = productInput(req.body);
  const product = await Product.create({ ...data, images: (req.files || []).map(file => `/uploads/${path.basename(file.filename)}`), seller: req.user.id });
  res.status(201).json({ product });
}));
router.patch("/seller/products/:id", authenticate, requireRole("seller"), upload.array("images", 5), asyncRoute(async (req, res) => {
  const product = await Product.findOne({ _id: req.params.id, seller: req.user.id });
  if (!product) return res.status(404).json({ error: "Product not found in your store." });
  const data = productInput({ ...product.toObject(), ...req.body });
  Object.assign(product, data);
  if (req.files?.length) product.images = req.files.map(file => `/uploads/${path.basename(file.filename)}`);
  await product.save();
  res.json({ product });
}));
router.patch("/seller/products/:id/status", authenticate, requireRole("seller"), asyncRoute(async (req, res) => {
  if (!["active", "paused"].includes(req.body.status)) return res.status(400).json({ error: "Choose active or paused availability." });
  const product = await Product.findOneAndUpdate({ _id: req.params.id, seller: req.user.id }, { status: req.body.status }, { new: true, runValidators: true });
  if (!product) return res.status(404).json({ error: "Product not found in your store." });
  res.json({ product });
}));
router.delete("/seller/products/:id", authenticate, requireRole("seller"), asyncRoute(async (req, res) => {
  const product = await Product.findOneAndDelete({ _id: req.params.id, seller: req.user.id });
  if (!product) return res.status(404).json({ error: "Product not found in your store." });
  res.json({ ok: true });
}));
router.get("/seller/orders", authenticate, requireRole("seller"), asyncRoute(async (req, res) => {
  const orders = await Order.find({ "items.seller": req.user.id }).sort({ createdAt: -1 }).populate("customer", "name");
  res.json({ items: orders.map(order => ({ ...order.toObject(), items: order.items.filter(item => String(item.seller) === req.user.id) })) });
}));
router.patch("/seller/orders/:id/status", authenticate, requireRole("seller"), asyncRoute(async (req, res) => {
  const transitions = { Pending: ["Confirmed"], Confirmed: ["Shipped"], Shipped: ["Delivered"] };
  const order = await Order.findOne({ _id: req.params.id, "items.seller": req.user.id });
  if (!order) return res.status(404).json({ error: "Order not found for your store." });
  const ownedItems = order.items.filter(item => String(item.seller) === req.user.id);
  if (!ownedItems.length || ownedItems.some(item => !transitions[item.status]?.includes(req.body.status))) return res.status(409).json({ error: "That order status transition is not permitted for your store's items." });
  ownedItems.forEach(item => { item.status = req.body.status; });
  const priority = ["Pending", "Confirmed", "Shipped", "Delivered"];
  const liveStatuses = order.items.map(item => item.status).filter(status => status !== "Cancelled");
  order.status = liveStatuses.length ? liveStatuses.reduce((earliest, status) => priority.indexOf(status) < priority.indexOf(earliest) ? status : earliest, "Delivered") : "Cancelled";
  await order.save();
  res.json({ order });
}));
router.patch("/seller/store", authenticate, requireRole("seller"), asyncRoute(async (req, res) => {
  const storeName = String(req.body.storeName || "").trim();
  const storeDescription = String(req.body.storeDescription || "").trim();
  if (storeName.length < 2 || storeName.length > 100 || storeDescription.length > 500) return res.status(400).json({ error: "Enter a valid store name and description." });
  req.user.storeName = storeName;
  req.user.storeDescription = storeDescription;
  await req.user.save();
  res.json({ user: publicUser(req.user) });
}));

router.post("/newsletter", asyncRoute(async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: "Enter a valid email address." });
  res.status(202).json({ message: "Newsletter signup is not connected to a mailing provider yet." });
}));
router.post("/contact", (req, res) => {
  const { name, email, message } = req.body;
  if (typeof name !== "string" || name.trim().length < 2 || !/^\S+@\S+\.\S+$/.test(email || "") || typeof message !== "string" || message.trim().length < 10 || message.length > 3000) return res.status(400).json({ error: "Enter your name, a valid email, and a message of at least 10 characters." });
  res.status(503).json({ error: "Contact delivery is not configured. Please use this local demo without entering personal information." });
});

module.exports = router;