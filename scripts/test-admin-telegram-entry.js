const fs = require('fs');
const assert = require('assert');

const server = fs.readFileSync('server.js', 'utf8');
const dashboardRoutes = fs.readFileSync('src/http/admin-dashboard-routes.js', 'utf8');
const entry = fs.readFileSync('public/admin-entry.js', 'utf8');

assert(dashboardRoutes.includes("router.get('/access'"), 'Admin access endpoint must exist');
assert(dashboardRoutes.includes('adminAuth'), 'Admin access must reuse adminAuth');
assert(dashboardRoutes.includes("res.json({ ok: true, admin: true })"), 'Admin access must return an explicit admin result');
assert(server.includes("app.use('/api/admin/dashboard', createAdminDashboardRouter())"), 'Admin dashboard router must remain mounted');
assert(server.includes('/admin-entry.js?v=${assetVersion}'), 'Admin entry script must be injected into the Telegram app');
assert(entry.includes('X-Telegram-Init-Data'), 'Admin entry must send Telegram initData');
assert(entry.includes('/api/admin/dashboard/access'), 'Admin entry must use the protected access endpoint');
assert(entry.includes("window.location.href = '/admin.html'"), 'Authorized admin must open the existing Admin Panel');
assert(entry.includes('hidden = false'), 'Admin button must stay hidden until authorization succeeds');
console.log('Admin Telegram entry contract: PASS');
