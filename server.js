import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const app = express();

const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json());


// Serve Mini App
app.use(express.static(path.join(__dirname, "public")));


// API health check
app.get("/api/status", (req, res) => {
  res.json({
    success: true,
    app: "DzMoney",
    status: "online"
  });
});


// Fallback
app.get("*", (req, res) => {
  res.sendFile(
    path.join(__dirname, "public", "index.html")
  );
});


// Start server
app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `DzMoney server running on port ${PORT}`
  );
});
