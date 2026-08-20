"use strict";

const express = require("express");
const fs = require("fs");
const path = require("path");

// Adds the same Admin economy controls to the /admin route (not only the
// static /admin.html route). Loaded after the other Admin middleware modules.
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
            const script = `<script src="/admin-economy-ui.js?v=2"></script>`;
            const output = html.includes("</body>") ? html.replace("</body>", `${script}</body>`) : `${html}${script}`;
            res.type("html").send(output);
          });
        };
      }
      next();
    });
  }
  return currentUse.call(this, ...args);
};
