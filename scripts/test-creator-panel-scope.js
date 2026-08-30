const fs = require('fs');

const app = fs.readFileSync('public/app.js', 'utf8');

const categoriesStart = app.indexOf('function renderTaskCategories()');
const categoriesEnd = app.indexOf('\nfunction sortDailyTasks', categoriesStart);
if (categoriesStart < 0 || categoriesEnd <= categoriesStart) throw new Error('Task category renderer not found');
const categoriesBody = app.slice(categoriesStart, categoriesEnd);

if (!categoriesBody.includes('setTaskModeTabsVisible(true)')) {
  throw new Error('Tasks landing surface must expose the task/creator mode tabs');
}
if (!categoriesBody.includes('creatorPanel.hidden = true')) {
  throw new Error('Creator panel must remain hidden on the task category landing surface');
}
if (categoriesBody.includes('creatorPanel.hidden = false')) {
  throw new Error('Creator panel must not be forced visible on the task category landing surface');
}

const categoryStart = app.indexOf('function renderTaskCategory(categoryKey)');
const categoryEnd = app.indexOf('\nfunction renderTasks()', categoryStart);
if (categoryStart < 0 || categoryEnd <= categoryStart) throw new Error('Task category renderer not found');
const categoryBody = app.slice(categoryStart, categoryEnd);
if (!categoryBody.includes('creatorPanel.hidden = true')) {
  throw new Error('Creator panel must be hidden inside a specific task category');
}

console.log('CREATOR_PANEL_LANDING_SCOPE: PASS');
console.log('CREATOR_PANEL_CATEGORY_SCOPE: PASS');
