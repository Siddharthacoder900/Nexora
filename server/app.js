require("dotenv").config();
const express = require("express");
const path = require("node:path");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const api = require("./routes/api");
const fs = require("node:fs");

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(helmet({
  contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    fontSrc: ["'self'", "https://fonts.gstatic.com"],
    imgSrc: ["'self'", "data:", "https://images.unsplash.com"],
    connectSrc: ["'self'"],
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
    frameAncestors: ["'none'"]
  } },
  crossOriginEmbedderPolicy: false
}));
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: false, limit: "100kb" }));
app.use(cookieParser());
app.use("/api", (req, res, next) => {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return next();
  if (req.get("sec-fetch-site") === "cross-site") return res.status(403).json({ error: "Cross-origin requests are not allowed." });
  const origin = req.get("origin");
  const expectedOrigin = process.env.CLIENT_ORIGIN || `${req.protocol}://${req.get("host")}`;
  if (origin && origin !== expectedOrigin) return res.status(403).json({ error: "Request origin could not be verified." });
  next();
});
app.use("/api/auth", rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false }));
app.use("/api", api);
app.use("/uploads", express.static(path.resolve(process.env.UPLOAD_DIR || "uploads"), { fallthrough: false, maxAge: "7d" }));
const clientRoot = path.resolve(__dirname, "..");
const builtClient = path.join(clientRoot, "client-dist");
const clientReady = fs.existsSync(path.join(builtClient, "index.html"));
const clientEntry = builtClient;
if (clientReady) app.use(express.static(clientEntry, { index: false, fallthrough: true }));
app.get("*", (req, res, next) => {
  if (req.path === "/api" || req.path.startsWith("/api/")) return next();
  if (!clientReady) return res.status(503).type("text/plain").send("React client is not built. Run npm run build, or use npm run dev:all for development.");
  res.sendFile(path.join(clientEntry, "index.html"), error => { if (error) next(error); });
});
app.use((error, _req, res, _next) => {
  const status = error.status || (error.name === "ValidationError" ? 400 : error.name === "CastError" ? 400 : 500);
  if (error.code === 11000) return res.status(409).json({ error: "An account with that email already exists." });
  if (error instanceof require("multer").MulterError) return res.status(400).json({ error: error.code === "LIMIT_FILE_SIZE" ? "Each image must be 5 MB or smaller." : "Upload up to 5 JPG, PNG, or WebP images." });
  res.status(status).json({ error: status === 500 ? "Something went wrong. Please try again." : error.message });
});

module.exports = app;