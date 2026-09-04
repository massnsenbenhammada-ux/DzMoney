const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const adEvent = fs.readFileSync(path.join(root, 'src/services/ad-event-service.js'), 'utf8');
const provider = fs.readFileSync(path.join(root, 'src/services/ad-provider-service.js'), 'utf8');
const monetag = fs.readFileSync(path.join(root, 'src/config/monetag.js'), 'utf8');
const onclicka = fs.readFileSync(path.join(root, 'src/config/onclicka.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const squad = fs.readFileSync(path.join(root, 'src/http/squad-routes.js'), 'utf8');
const reward = fs.readFileSync(path.join(root, 'src/services/task-advertisement-service.js'), 'utf8');

assert.match(adEvent, /'squad'/, 'canonical advertisement contexts must include squad');
assert.match(provider, /SQUAD_PROVIDER_ORDER = \['monetag', 'onclicka'\]/, 'Squad rotation must be Monetag then OnClickA');
assert.match(monetag, /MONETAG_SQUAD_CONTEXT = 'squad'/, 'Monetag needs an explicit Squad context');
assert.match(onclicka, /'squad'/, 'OnClickA needs an explicit Squad context');
assert.match(server, /contexts = \['task', 'gaming', 'daily_checkin', 'verification', 'squad'\]/, 'client config must expose Squad ads');
assert.match(squad, /router\.post\('\/ads\/start'/, 'Squad must expose an authenticated ad start endpoint');
assert.match(squad, /router\.get\('\/ads\/status'/, 'Squad must expose authenticated ad status');
assert.match(reward, /activityContext: context/, 'Squad finalization must use the existing Economy activity context');
assert.match(reward, /context !== 'squad'/, 'standard finalization must remain scoped to Squad');

console.log('Squad Ads contract checks passed.');
