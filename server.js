const express = require("express");

const app = express();

const PORT = process.env.PORT || 3000;

console.log("DzMoney starting...");
console.log("Node:", process.version);
console.log("PORT:", PORT);

app.get("/", (req, res) => {
  res.status(200).send("DzMoney is ONLINE");
});

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

app.listen(PORT, "0.0.0.0", () => {
  console.log(`DzMoney server running on 0.0.0.0:${PORT}`);
});
