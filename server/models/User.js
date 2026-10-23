const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const addressSchema = new mongoose.Schema({
  label: { type: String, default: "Home", maxlength: 40 },
  name: { type: String, trim: true, maxlength: 100 },
  phone: { type: String, trim: true, match: [/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian phone number"] },
  house: { type: String, trim: true, maxlength: 180 },
  city: { type: String, trim: true, maxlength: 80 },
  state: { type: String, trim: true, maxlength: 80 },
  pin: { type: String, trim: true, match: [/^\d{6}$/, "PIN code must contain 6 digits"] }
}, { _id: true });

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
  phone: { type: String, required: true, match: [/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian phone number"] },
  passwordHash: { type: String, required: true, select: false },
  tokenVersion: { type: Number, default: 0 },
  role: { type: String, enum: ["customer", "seller"], required: true },
  storeName: { type: String, trim: true, maxlength: 100 },
  storeDescription: { type: String, trim: true, maxlength: 500, default: "" },
  approved: { type: Boolean, default: true },
  addresses: { type: [addressSchema], default: [] },
  wishlist: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }]
}, { timestamps: true });

userSchema.pre("save", async function hashPassword() {
  if (this.isModified("passwordHash")) this.passwordHash = await bcrypt.hash(this.passwordHash, 12);
});
userSchema.methods.verifyPassword = function verifyPassword(password) {
  return bcrypt.compare(password, this.passwordHash);
};
userSchema.set("toJSON", { transform(_doc, result) { delete result.passwordHash; delete result.__v; return result; } });

module.exports = mongoose.model("User", userSchema);