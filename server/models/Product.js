const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 3, maxlength: 120 },
  description: { type: String, required: true, trim: true, minlength: 10, maxlength: 4000 },
  category: { type: String, required: true, enum: ["Electronics", "Fashion", "Home & Living", "Books", "Accessories"] },
  price: { type: Number, required: true, min: 1, max: 10000000 },
  discount: { type: Number, default: 0, min: 0, max: 90 },
  stock: { type: Number, required: true, min: 0, max: 100000 },
  images: { type: [String], default: [] },
  seller: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  status: { type: String, enum: ["active", "paused", "pending"], default: "active", index: true },
  averageRating: { type: Number, default: 0, min: 0, max: 5 },
  reviewCount: { type: Number, default: 0, min: 0 },
  soldCount: { type: Number, default: 0, min: 0 }
}, { timestamps: true });

productSchema.index({ name: "text", description: "text" });
productSchema.virtual("salePrice").get(function salePrice() { return Math.round(this.price * (100 - this.discount) / 100); });
productSchema.set("toJSON", { virtuals: true, transform(_doc, result) { delete result.__v; return result; } });

module.exports = mongoose.model("Product", productSchema);