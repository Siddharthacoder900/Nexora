const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
  seller: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  name: { type: String, required: true },
  image: { type: String, default: "" },
  quantity: { type: Number, required: true, min: 1 },
  unitPrice: { type: Number, required: true, min: 1 },
  discount: { type: Number, default: 0 },
  status: { type: String, enum: ["Pending", "Confirmed", "Shipped", "Delivered", "Cancelled"], default: "Pending" }
}, { _id: true });

const orderSchema = new mongoose.Schema({
  reference: { type: String, required: true, unique: true, index: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  items: { type: [orderItemSchema], required: true, validate: value => value.length > 0 },
  address: { name: String, phone: String, house: String, city: String, state: String, pin: String },
  paymentMethod: { type: String, enum: ["cod"], default: "cod" },
  subtotal: { type: Number, required: true },
  deliveryFee: { type: Number, required: true },
  discountTotal: { type: Number, default: 0 },
  total: { type: Number, required: true },
  status: { type: String, enum: ["Pending", "Confirmed", "Shipped", "Delivered", "Cancelled"], default: "Pending", index: true }
}, { timestamps: true });

orderSchema.index({ "items.seller": 1, createdAt: -1 });
module.exports = mongoose.model("Order", orderSchema);