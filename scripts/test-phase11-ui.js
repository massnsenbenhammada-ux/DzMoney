const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = name => fs.readFileSync(path.join(__dirname, '..', 'public', name), 'utf8');
const index = read('index.html');
const premium = read('premium-ui.js');
const premiumCss = read('premium-ui.css');
const gaming = read('gaming.js');
const squadState = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'squad-daily-state-service.js'), 'utf8');

assert.match(index, /class="bottom-nav"/);
assert.match(index, /data-go="home"/);
assert.match(index, /data-go="tasks"/);
assert.match(index, /data-go="wallet"/);
assert.match(index, /data-page="gaming"/);
assert.match(index, /data-page="squad"/);
assert.match(index, /id="promoCodeCard"/);

assert.match(premium, /phase11-home-overview/);
assert.match(premium, /data-home-squad-members/);
assert.match(premium, /data-home-spin-balance/);
assert.match(premium, /data-home-axe-balance/);
assert.match(premium, /Daily Activity/);
assert.match(premium, /Packages are coming soon/);
assert.match(premium, /Coming Soon/);
assert.match(premium, /phase11-user-drawer/);
assert.match(premium, /translateX\(100%\)/);
assert.match(premium, /api\('\/api\/squad'\)/);
assert.match(premium, /api\('\/api\/daily-checkin\/status'\)/);
assert.match(premium, /textContent = 'Execute'/);
assert.match(premium, /phase11-conversion-notice/);
assert.match(premium, /phase11-squad-rules/);

assert.match(premiumCss, /width:min\(85vw,440px\)/);
assert.match(premiumCss, /transform:translateX\(100%\)/);
assert.match(premiumCss, /prefers-reduced-motion/);
assert.match(premiumCss, /phase11-conversion-notice/);
assert.match(premiumCss, /phase11-anti-manipulation/);

const gamingOrder = [index.indexOf('Gaming Ads'), index.indexOf('Tasks')];
assert.ok(gamingOrder[0] >= 0 && gamingOrder[1] >= 0 && gamingOrder[0] < gamingOrder[1]);
assert.match(squadState, /activeMemberCount \* 2 >= state\.eligible_member_count/);

console.log('Phase 11 UI contract checks passed.');
