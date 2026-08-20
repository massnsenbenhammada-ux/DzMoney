"use strict";

// Stable Admin Settings API contract.
//
// There is one authoritative settings writer in admin-settings-compat.js.
// This module only normalizes the request before that writer sees it. It is
// intentionally UI-agnostic: both {settings:{...}} and a flat JSON body are
// accepted. No database writes happen here and no second settings handler is
// installed.

const express = require("express");

if (!express.application.__dzmoneySettingsContract) {
  const previousPut = express.application.put;

  express.application.put = function settingsContractPut(path, ...handlers) {
    if (path === "/api/admin/settings" && handlers.length >= 1) {
      const originalFirstHandler = handlers[0];

      const normalizeSettingsBody = (req, res, next) => {
        const body = req.body;
        if (
          body &&
          typeof body === "object" &&
          !Array.isArray(body) &&
          (!body.settings || typeof body.settings !== "object" || Array.isArray(body.settings))
        ) {
          req.body = { settings: body };
        }
        return originalFirstHandler(req, res, next);
      };

      return previousPut.call(this, path, normalizeSettingsBody, ...handlers.slice(1));
    }

    return previousPut.call(this, path, ...handlers);
  };

  express.application.__dzmoneySettingsContract = true;
  console.log("DzMoney Admin Settings contract: ENABLED");
}
