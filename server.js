const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon"
};

function sendJSON(res, data, statusCode = 200) {
  const body = JSON.stringify(data);

  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });

  res.end(body);
}

function sendFile(res, filePath) {
  fs.readFile(filePath, (error, data) => {
    if (error) {
      sendJSON(
        res,
        {
          success: false,
          error: "File not found"
        },
        404
      );

      return;
    }

    const ext = path.extname(filePath).toLowerCase();

    const contentType =
      MIME_TYPES[ext] ||
      "application/octet-stream";

    res.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": data.length
    });

    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url);
  const pathname = parsedUrl.pathname;

  // ============================
  // API status
  // ============================

  if (pathname === "/api/status") {
    sendJSON(res, {
      success: true,
      app: "DzMoney",
      status: "online",
      node: process.version
    });

    return;
  }

  // ============================
  // API root
  // ============================

  if (pathname === "/api") {
    sendJSON(res, {
      success: true,
      message: "DzMoney API is working",
      node: process.version
    });

    return;
  }

  // ============================
  // Frontend
  // ============================

  let requestedPath = pathname;

  if (requestedPath === "/") {
    requestedPath = "/index.html";
  }

  // Prevent path traversal
  const safePath = path.normalize(requestedPath)
    .replace(/^(\.\.(\/|\\|$))+/, "");

  const filePath = path.join(
    PUBLIC_DIR,
    safePath
  );

  // Make sure file stays inside public directory
  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendJSON(
      res,
      {
        success: false,
        error: "Forbidden"
      },
      403
    );

    return;
  }

  fs.stat(filePath, (error, stats) => {

    if (!error && stats.isFile()) {
      sendFile(res, filePath);
      return;
    }

    // Frontend fallback
    sendFile(
      res,
      path.join(PUBLIC_DIR, "index.html")
    );
  });
});

// ============================
// Start server
// ============================

server.listen(PORT, "0.0.0.0", () => {
  console.log("================================");
  console.log("DzMoney server started");
  console.log("================================");
  console.log("Node version:", process.version);
  console.log("Port:", PORT);
  console.log("Public directory:", PUBLIC_DIR);
  console.log("================================");
});
