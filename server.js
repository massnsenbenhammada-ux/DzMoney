const express = require("express");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;

console.log("DzMoney starting...");
console.log("Node:", process.version);
console.log("PORT:", PORT);

// ============================
// Frontend
// ============================

const publicPath = path.join(__dirname, "public");

app.use(express.static(publicPath));

// ============================
// API
// ============================

app.get("/api", (req, res) => {
  res.status(200).json({
    success: true,
    message: "DzMoney API is working"
  });
});

app.get("/api/status", (req, res) => {
  res.status(200).json({
    success: true,
    app: "DzMoney",
    status: "online",
    node: process.version
  });
});

// ============================
// Start server
// ============================

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `DzMoney server running on 0.0.0.0:${PORT}`
  );
});
