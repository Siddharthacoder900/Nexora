require("dotenv").config();
const mongoose = require("mongoose");
const User = require("./models/User");
const Product = require("./models/Product");

const sampleProducts = [
  ["Soundwave Studio Headphones", "Electronics", 7499, 18, 8, 4.8, "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=82", "Balanced studio sound, soft over-ear cushions, and a long-lasting battery for commutes and calls."],
  ["Everyday Weekender Tote", "Fashion", 2499, 12, 12, 4.7, "https://images.unsplash.com/photo-1590874103328-eac38a683ce7?auto=format&fit=crop&w=900&q=82", "A roomy carryall with sturdy handles and useful inside pockets for commutes and quick getaways."],
  ["Arc Rechargeable Table Lamp", "Home & Living", 3299, 0, 6, 4.9, "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=900&q=82", "A warm pool of light in a portable rechargeable design that moves easily around your home."],
  ["Slow Mornings Daily Journal", "Books", 699, 0, 20, 4.6, "https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&w=900&q=82", "An undated journal with space for small intentions and big ideas, printed on softly textured paper."],
  ["Sunday Ceramic Cup Set", "Home & Living", 1599, 15, 10, 4.8, "https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?auto=format&fit=crop&w=900&q=82", "Hand-finished ceramic cups with a tactile glaze and comfortable everyday shape."],
  ["Daylight Mini Bluetooth Speaker", "Electronics", 2899, 0, 9, 4.5, "https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?auto=format&fit=crop&w=900&q=82", "Easy room-filling sound in a compact speaker that goes wherever the day takes you."],
  ["Everyday Cotton Shirt", "Fashion", 1999, 20, 7, 4.7, "https://images.unsplash.com/photo-1598033129183-c4f50c736f10?auto=format&fit=crop&w=900&q=82", "A breathable cotton shirt with an easy shape that works tucked, loose, and layered."],
  ["Daily Carry Crossbody", "Accessories", 2199, 0, 11, 4.6, "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?auto=format&fit=crop&w=900&q=82", "A compact hands-free companion with space for essentials and a secure zip closure."],
  ["The Design Anthology", "Books", 1199, 0, 14, 4.9, "https://images.unsplash.com/photo-1519682337058-a94d519337bc?auto=format&fit=crop&w=900&q=82", "A thoughtful collection of interiors, objects, and ideas to make everyday spaces personal."],
  ["Form Desk Organizer", "Accessories", 1699, 10, 15, 4.4, "https://images.unsplash.com/photo-1499951360447-b19be8fe80f5?auto=format&fit=crop&w=900&q=82", "A streamlined organizer that keeps daily tools close without crowding your workspace."],
  ["Cloudsoft Woven Throw", "Home & Living", 3999, 0, 5, 4.8, "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=900&q=82", "A lightweight textured layer for the sofa, bed, or a slower Sunday morning."],
  ["Little Moments Film Camera", "Electronics", 9999, 10, 4, 4.5, "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=900&q=82", "A simple point-and-shoot film camera for capturing the unplanned bits and enjoying the moment."]
].map(([name, category, price, discount, stock, averageRating, image, description], index) => ({ name, category, price, discount, stock, averageRating, reviewCount: [126, 84, 203, 59, 92, 71, 112, 65, 48, 37, 96, 44][index], soldCount: [92, 64, 145, 51, 77, 48, 89, 39, 32, 27, 56, 19][index], images: [image], description, status: "active" }));

async function seed() {
  if (!process.env.MONGODB_URI) throw new Error("Set MONGODB_URI in .env before seeding.");
  await mongoose.connect(process.env.MONGODB_URI);
  let seller = await User.findOne({ email: "demo-seller@nexora.example" });
  if (!seller) seller = await User.create({ name: "Nexora Demo Seller", email: "demo-seller@nexora.example", phone: "9876543210", passwordHash: "DemoSeller123!", role: "seller", storeName: "Common Ground Goods" });
  const existing = await Product.countDocuments({ seller: seller.id });
  if (existing) {
    console.log(`Demo seller already has ${existing} products; no changes made.`);
  } else {
    await Product.insertMany(sampleProducts.map(item => ({ ...item, seller: seller.id })));
    console.log(`Seeded ${sampleProducts.length} products for Common Ground Goods.`);
  }
  console.log("Demo seller: demo-seller@nexora.example / DemoSeller123! (development only)");
  await mongoose.disconnect();
}

seed().catch(error => { console.error(error); process.exitCode = 1; });
