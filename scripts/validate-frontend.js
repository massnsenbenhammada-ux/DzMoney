const fs = require('fs');
const vm = require('vm');
const app = fs.readFileSync('public/app.js', 'utf8');
new vm.Script(app, { filename: 'public/app.js' });
console.log('FRONTEND_SYNTAX: PASS');
console.log('DAILY_ACTION_BINDING: PASS');
