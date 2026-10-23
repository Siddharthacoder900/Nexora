require("dotenv").config();
const mongoose = require("mongoose");
const app = require("./app");

const port = Number(process.env.PORT) || 3000;
const mongoUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/nexora";

mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 })
  .then(() => console.log("Nexora database connected."))
  .catch(error => console.warn(`MongoDB unavailable (${error.message}). Serving the frontend in demo mode; database-backed API actions require MongoDB.`));

app.listen(port, () => console.log(`Nexora is running at http://localhost:${port}`));