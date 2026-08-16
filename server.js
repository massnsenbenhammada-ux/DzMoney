const express = require("express");
const path = require("path");

const app = express();

// Railway provides the PORT automatically
const PORT = process.env.PORT || 3000;

// Parse JSON requests
app.use(express.json());

// Serve files from the public folder
app.use(express.static(path.join(__dirname, "public")));

// Health / status API
app.get("/api/status", (req, res) => {
  res.json({
    success: true,
    app: "DzMoney",
    status: "online"
  });
});

// Basic API test
app.get("/api", (req, res) => {
  res.json({
    success: true,
    message: "DzMoney API is working"
  });
});

// SPA fallback
// IMPORTANT:
// We intentionally do NOT use app.get("*")
// because Express 5 throws:
// PathError: Missing parameter name
app.use((req, res) => {
  res.sendFile(
    path.join(__dirname, "public", "index.html")
  );
});

// Start server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`DzMoney server running on port ${PORT}`);
});
