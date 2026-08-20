"use strict";

const express = require("express");
const fs = require("fs");
const path = require("path");

// The production Admin Panel is rendered from one authoritative UI layer.
// The legacy HTML remains as a safe fallback, while admin-v2.js replaces the
// visible UI after authentication and the live dashboard enhancer replaces
// only the Dashboard page with database-backed metrics.
const currentUse = express.application.use;
let useCount = 0;

express.application.use = function(...args) {
  useCount += 1;
  if (useCount === 3) {
    currentUse.call(this, (req, res, next) => {
      if ((String(req.path || "") === "/admin" || String(req.path || "") === "/admin.html") && typeof res.sendFile === "function") {
        const originalSendFile = res.sendFile.bind(res);
        res.sendFile = function(filePath, ...sendArgs) {
          if (path.basename(String(filePath)) !== "admin.html") return originalSendFile(filePath, ...sendArgs);
          fs.readFile(filePath, "utf8", (error, html) => {
            if (error) return originalSendFile(filePath, ...sendArgs);
            const scripts = `<script src="/admin-economy-ui.js?v=4"></script><script src="/admin-v2.js?v=2"></script><script src="/admin-dashboard.js?v=1"></script>`;
            const output = html.includes("</body>") ? html.replace("</body>", `${scripts}</body>`) : `${html}${scripts}`;
            res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
            res.setHeader("Pragma", "no-cache");
            res.setHeader("Expires", "0");
            res.type("html").send(output);
          });
        };
      }
      next();
    });
  }
  return currentUse.call(this, ...args);
};
