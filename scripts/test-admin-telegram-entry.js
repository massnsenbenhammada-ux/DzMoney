const fs = require("fs");
const assert = require("assert");

const server = fs.readFileSync("server.js", "utf8");
const dashboardRoutes = fs.readFileSync(
  "src/http/admin-dashboard-routes.js",
  "utf8",
);
const entry = fs.readFileSync("public/admin-entry.js", "utf8");

assert(
  /router\.get\(["']\/access["']/.test(dashboardRoutes),
  "Admin access endpoint must exist",
);
assert(
  dashboardRoutes.includes("adminAuth"),
  "Admin access must reuse adminAuth",
);
assert(
  /res\.json\(\{\s*ok:\s*true,\s*admin:\s*true\s*\}\)/.test(dashboardRoutes),
  "Admin access must return an explicit admin result",
);
assert(
  /app\.use\(["']\/api\/admin\/dashboard["']\s*,\s*createAdminDashboardRouter\(\)\)/.test(
    server,
  ),
  "Admin dashboard router must remain mounted",
);
assert(
  server.includes("/admin-entry.js?v=${assetVersion}"),
  "Admin entry script must be injected into the Telegram app",
);
assert(
  entry.includes("X-Telegram-Init-Data"),
  "Admin entry must send Telegram initData",
);
assert(
  entry.includes("/api/admin/dashboard/access"),
  "Admin entry must use the protected access endpoint",
);
assert(
  /window\.location\.href\s*=\s*["']\/admin\.html["']/.test(entry),
  "Authorized admin must open the existing Admin Panel",
);
assert(
  entry.includes("if (!isAdmin) return;"),
  "Admin button must not be created before authorization succeeds",
);
console.log("Admin Telegram entry contract: PASS");
