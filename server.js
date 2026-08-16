const express = require("express");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;
const publicPath = path.join(__dirname, "public");

// ============================
// Environment diagnostics
// ============================

console.log("================================");
console.log("DzMoney Environment");
console.log("================================");
console.log("Node version:", process.version);
console.log(
  "Express version:",
  require("express/package.json").version
);
console.log("Working directory:", process.cwd());
console.log("Server file:", __filename);
console.log("PORT:", PORT);
console.log("Public path:", publicPath);
console.log("================================");

// ============================
// Middleware
// ============================

app.use(express.json());

// ============================
// Frontend static files
// ============================

app.use(express.static(publicPath));

// ============================
// API status
// ============================

app.get("/api/status", (req, res) => {
  res.json({
    success: true,
    app: "DzMoney",
    status: "online",
    node: process.version,
    express: require("express/package.json").version
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
// مهم:
// لا تستخدم app.get("*")
// ولا app.get("/*")
// مع Express 5.
//
// نستخدم هذا middleware بدون route pattern.

app.use((req, res, next) => {
  // API غير موجود
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({
      success: false,
      error: "API endpoint not found"
    });
  }

  // إرسال الواجهة
  res.sendFile(path.join(publicPath, "index.html"), (err) => {
    if (err) {
      next(err);
    }
  });
});

// ============================
// Error handler
// ============================

app.use((err, req, res, next) => {
  console.error("SERVER ERROR:", err);

  res.status(500).json({
    success: false,
    error: "Internal server error"
  });
});

// ============================
// Start server
// ============================

app.listen(PORT, "0.0.0.0", () => {
  console.log("================================");
  console.log("DzMoney server is ONLINE");
  console.log("Port:", PORT);
  console.log("Node:", process.version);
  console.log(
    "Express:",
    require("express/package.json").version
  );
  console.log("================================");
});
