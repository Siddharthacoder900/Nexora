const jwt = require("jsonwebtoken");
const User = require("../models/User");

async function authenticate(req, res, next) {
  try {
    const token = req.cookies.nexora_session;
    if (!token) return res.status(401).json({ error: "Please sign in to continue." });
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.sub);
    if (!user || payload.tv !== user.tokenVersion) return res.status(401).json({ error: "Session is no longer valid." });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: "Please sign in to continue." });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ error: "You do not have permission to access this resource." });
    next();
  };
}

module.exports = { authenticate, requireRole };