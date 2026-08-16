const express = require("express");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;

// ============================
// Middleware
// ============================

app.use(express.json());

// ============================
// Frontend
// ============================

const publicPath = path.join(__dirname, "public");

app.use(express.static(publicPath));

// ============================
// API status
// ============================

app.get("/api/status", (req, res) => {
  res.json({
    success: true,
    app: "DzMoney",
    status: "online"
  });
});

// ============================
// API root
// ============================

app.get("/api", (req, res) => {
  res.json({
    success: true,
    message: "DzMoney API is working"
  });
});

// ============================
// Frontend fallback
// ============================

app.use((req, res) => {
  res.sendFile(
    path.join(publicPath, "index.html")
  );
});

// ============================
// Start server
// ============================

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `DzMoney server running on port ${PORT}`
  );

  console.log(
    "Express version:",
    require("express/package.json").version
  );
});
