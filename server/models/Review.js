const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true, index: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  text: { type: String, trim: true, maxlength: 1200, default: "" }
}, { timestamps: true });
reviewSchema.index({ product: 1, customer: 1, order: 1 }, { unique: true });

module.exports = mongoose.model("Review", reviewSchema);