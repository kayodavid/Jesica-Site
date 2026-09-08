const fs = require('fs');
const path = 'c:/Users/kayod/Downloads/projeto_jesica_atualizado/questionnaire-email.js';
let js = fs.readFileSync(path, 'utf8');

// Fix Promise.all Destructuring
js = js.replace(
  'const [quiz, records, preferences] = await Promise.all([',
  'const [quiz, records, clickResult, preferences] = await Promise.all(['
);

// Fix responseTargetScore matching without dates
const targetScoreSearch = `  const responseAt = Date.parse(response.respondedAt || response.sentAt || '');
  const invitationAt = Date.parse(invitation.sentAt || '');
  if (!Number.isFinite(responseAt) || !Number.isFinite(invitationAt)) return 0;`;

const targetScoreReplace = `  const responseAt = Date.parse(response.respondedAt || response.sentAt || '');
  const invitationAt = Date.parse(invitation.sentAt || '');
  if (!Number.isFinite(responseAt) || !Number.isFinite(invitationAt)) return -1;`;

if (js.includes(targetScoreSearch)) {
  js = js.replace(targetScoreSearch, targetScoreReplace);
}

fs.writeFileSync(path, js, 'utf8');
console.log('Fixed API bugs');
