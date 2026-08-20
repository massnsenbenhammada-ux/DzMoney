"use strict";

// DzMoney Admin UI: admin.html is the single authoritative interface.
// Do NOT inject admin-v2 or other competing UI runtimes here. Those runtimes
// replace document.body and were the reason Settings disappeared and refresh
// returned to Dashboard. The canonical admin.html already contains its own
// router, Settings UI, persistence and API calls.
const express = require("express");

const currentUse = express.application.use;
let installed = false;

express.application.use = function(...args) {
  if (!installed) {
    installed = true;
    currentUse.call(this, (req, res, next) => {
      const p = String(req.path || "");
      if (p === "/admin" || p === "/admin.html") {
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
      }
      next();
    });
  }
  return currentUse.call(this, ...args);
};
