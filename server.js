const express = require("express");
const path = require("path");

const app = express();

console.log("================================");
console.log("DzMoney SERVER STARTING");
console.log("Express version:", require("express/package.json").version);
console.log("Node version:", process.version);
console.log("Server file:", __filename);
console.log("================================");

const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Serve frontend
app.use(express.static(path.join(__dirname, "public")));

// API status
app.get("/api/status", (req, res) => {
  res.json({
    success: true,
    app: "DzMoney",
    status: "online"
  });
});

// API root
app.get("/api", (req, res) => {
  res.json({
    success: true,
    message: "DzMoney API is working"
  });
});

// Frontend fallback
// استخدم app.use بدون "*" لتجنب مشكلة path-to-regexp
app.use((req, res) => {
  res.sendFile(
    path.join(__dirname, "public", "index.html")
  );
});

// Start server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`DzMoney server running on port ${PORT}`);
});
