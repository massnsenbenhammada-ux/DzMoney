"use strict";

const express = require("express");
const fs = require("fs");
const path = require("path");

// Inject the authoritative Admin UI on /admin and /admin.html.
// This module is preloaded before server.js, so the enhancer must be installed
// on the first app.use() call. Waiting for a later counter value is unsafe
// because other preload wrappers also wrap express.application.use().
const currentUse = express.application.use;
let installed = false;

express.application.use = function(...args) {
  if (!installed) {
    installed = true;
    currentUse.call(this, (req, res, next) => {
      if ((String(req.path || "") === "/admin" || String(req.path || "") === "/admin.html") && typeof res.sendFile === "function") {
        const originalSendFile = res.sendFile.bind(res);
        res.sendFile = function(filePath, ...sendArgs) {
          if (path.basename(String(filePath)) !== "admin.html") return originalSendFile(filePath, ...sendArgs);
          fs.readFile(filePath, "utf8", (error, html) => {
            if (error) return originalSendFile(filePath, ...sendArgs);
            const scripts = `<script src="/admin-economy-ui.js?v=5"></script><script src="/admin-v2.js?v=3"></script><script src="/admin-dashboard.js?v=2"></script><script src="/admin-live-refresh.js?v=2"></script>`;
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
