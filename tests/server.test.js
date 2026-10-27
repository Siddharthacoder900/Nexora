const test = require("node:test");
const assert = require("node:assert/strict");
const app = require("../server/app");
const mongoose = require("mongoose");
const Product = require("../server/models/Product");
const { requireRole } = require("../server/middleware/auth");

let server;
let baseUrl;
test.before(async () => {
  server = app.listen(0);
  await new Promise(resolve => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  await new Promise(resolve => server.close(resolve));
  await mongoose.disconnect();
});

test("health exposes demo mode while MongoDB is disconnected", async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, database: "unavailable", mode: "demo" });
});

test("customer profile rejects an unauthenticated request", async () => {
  const response = await fetch(`${baseUrl}/api/profile`);
  assert.equal(response.status, 401);
  assert.match((await response.json()).error, /sign in/i);
});

test("seller dashboard rejects an unauthenticated request", async () => {
  const response = await fetch(`${baseUrl}/api/seller/dashboard`);
  assert.equal(response.status, 401);
});

test("registration validates Indian contact details before database writes", async () => {
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Demo User", email: "demo@example.com", phone: "12345", password: "short", role: "customer" })
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /Indian phone/i);
});

test("static shell is served by Express", async () => {
  const response = await fetch(`${baseUrl}/`);
  if (require("node:fs").existsSync(require("node:path").join(__dirname, "..", "client-dist", "index.html"))) {
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Discover\. Choose\. Shop\./);
  } else {
    assert.equal(response.status, 503);
    assert.match(await response.text(), /npm run build/);
  }
});

test("contact endpoint does not pretend a message was delivered", async () => {
  const response = await fetch(`${baseUrl}/api/contact`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Demo", email: "demo@example.in", message: "A long enough sample message." })
  });
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /not configured/i);
});

test("cross-origin state changes are rejected", async () => {
  const response = await fetch(`${baseUrl}/api/contact`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://attacker.example" },
    body: JSON.stringify({ name: "Demo", email: "demo@example.in", message: "A long enough sample message." })
  });
  assert.equal(response.status, 403);
  assert.match((await response.json()).error, /origin/i);
});

test("same-origin HTTPS state changes work behind a trusted proxy", async () => {
  const configuredOrigin = process.env.CLIENT_ORIGIN;
  delete process.env.CLIENT_ORIGIN;
  try {
    const response = await fetch(`${baseUrl}/api/contact`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: baseUrl.replace("http://", "https://"),
        "X-Forwarded-Proto": "https"
      },
      body: JSON.stringify({ name: "Demo", email: "demo@example.in", message: "A long enough sample message." })
    });
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /not configured/i);
  } finally {
    if (configuredOrigin !== undefined) process.env.CLIENT_ORIGIN = configuredOrigin;
  }
});

test("backend source is not served as a static asset", async () => {
  const response = await fetch(`${baseUrl}/server/routes/api.js`);
  assert.equal(response.status, 200);
  assert.doesNotMatch(await response.text(), /require\("express"\)/);
});

test("role middleware rejects customers from seller routes", () => {
  let status = 200;
  let body;
  const response = { status(code) { status = code; return this; }, json(value) { body = value; return this; } };
  requireRole("seller")({ user: { role: "customer" } }, response, () => assert.fail("customer must not continue"));
  assert.equal(status, 403);
  assert.match(body.error, /permission/i);
});

test("product sale price uses percentage arithmetic", () => {
  const item = new Product({ name: "Demo headphones", description: "A sufficiently long sample product description.", category: "Electronics", price: 7499, discount: 18, stock: 1, seller: new mongoose.Types.ObjectId() });
  assert.equal(item.salePrice, 6149);
  const mug = new Product({ name: "Demo ceramic mug", description: "A sufficiently long ceramic mug description.", category: "Home & Living", price: 1499, discount: 10, stock: 4, seller: new mongoose.Types.ObjectId() });
  assert.equal(mug.salePrice, 1349);
});
