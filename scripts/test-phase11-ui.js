const assert = require('node:assert/strict');
const fs = require('node:fs');

const index = fs.readFileSync('public/index.html', 'utf8');
const premiumUi = fs.readFileSync('public/premium-ui.js', 'utf8');
const premiumCss = fs.readFileSync('public/premium-ui.css', 'utf8');
const squadCss = fs.readFileSync('public/squad.css', 'utf8');
const squadRoutes = fs.readFileSync('src/http/squad-routes.js', 'utf8');
const app = fs.readFileSync('public/app.js', 'utf8');
const gaming = fs.readFileSync('public/gaming.js', 'utf8');

assert.match(index, /data-page="home"/);
assert.match(index, /data-page="gaming"[\s\S]*Gaming Ads[\s\S]*Tasks/);
assert.match(index, /Converted or purchased\/transferred DZP is not earned activity/);
assert.match(index, /data-go="squad"/);
assert.match(index, /data-go="friends"/);

assert.match(premiumUi, /phase11-home-overview/);
assert.match(premiumUi, /data-home-squad-summary/);
assert.match(premiumUi, /Squad #\$\{squad\.id\} • Level/);
assert.match(premiumUi, /Current Level/);
assert.match(premiumUi, /Current Members/);
assert.match(premiumUi, /Required/);
assert.match(premiumUi, /Progress/);
assert.match(premiumUi, /phase11-user-drawer/);
assert.match(premiumUi, /phase11DrawerPhoto/);
assert.match(premiumUi, /api\('\/api\/me'\)/);
assert.match(premiumUi, /api\('\/api\/squad'\)/);
assert.match(premiumUi, /api\('\/api\/daily-checkin\/status'\)/);
assert.match(premiumUi, /phase11-conversion-notice/);
assert.match(premiumUi, /phase11-anti-manipulation/);
assert.match(premiumUi, /textContent = 'Execute'/);
assert.match(premiumUi, /phase11-squad-nav/);

const observerBlock = premiumUi.slice(premiumUi.indexOf('const observer = new MutationObserver'));
assert.match(observerBlock, /observer\.disconnect\(\)/);
assert.match(observerBlock, /finally \{[\s\S]*observer\.observe\(root, \{ childList: true, subtree: true \}\)/);

assert.match(premiumCss, /width:min\(85vw,440px\)/);
assert.match(premiumCss, /transform:translateX\(100%\)/);
assert.match(premiumCss, /phase11-drawer-panel/);
assert.match(premiumCss, /prefers-reduced-motion/);
assert.match(premiumCss, /phase11-conversion-notice/);
assert.match(premiumCss, /phase11-anti-manipulation/);
assert.match(squadCss, /phase11-squad-progress/);
assert.match(squadCss, /phase11-squad-nav/);

assert.match(squadRoutes, /getPaidMembershipTiers/);
assert.match(squadRoutes, /tierLevel/);
assert.match(squadRoutes, /requiredMembers/);
assert.match(squadRoutes, /progressPercent/);

const gamingPage = index.slice(index.indexOf('data-page="gaming"'));
const gamingOrder = [gamingPage.indexOf('Gaming Ads'), gamingPage.indexOf('Tasks')];
assert.ok(gamingOrder[0] >= 0 && gamingOrder[1] >= 0 && gamingOrder[0] < gamingOrder[1]);
assert.match(gaming, /setAll\('\[data-spin-balance\]'/);
assert.match(gaming, /setAll\('\[data-axe-balance\]'/);

const nonDailyTask = app.slice(app.indexOf('if (!isDaily)'));
assert.match(nonDailyTask, /data-task-open=/);
assert.match(nonDailyTask, /data-task-verify=/);
assert.match(nonDailyTask, /task-verify-action/);

const navMatch = index.match(/<nav class="bottom-nav"[\s\S]*?<\/nav>/);
assert.ok(navMatch, 'Bottom navigation must exist');
assert.equal((navMatch[0].match(/class="nav-item/g) || []).length, 5);
const nav = navMatch[0];
assert.ok(nav.indexOf('data-go="tasks"') < nav.indexOf('data-go="squad"'));
assert.ok(nav.indexOf('data-go="squad"') < nav.indexOf('data-go="friends"'));
assert.match(squadCss, /\.phase11-squad-nav\{[^}]*transform:translateY\(-8px\)/);

console.log('Phase 11 UI contract checks passed.');
