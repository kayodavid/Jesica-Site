const fs = require('fs');
const path = 'c:/Users/kayod/Downloads/projeto_jesica_atualizado/questionnaire-email.js';
let js = fs.readFileSync(path, 'utf8');

const regex = /const \[quiz, records\] = await Promise\.all\(\[\s+loadQuiz\(invitation\.sessionToken, invitation\.quizId\),\s+listStoredQuestionnaireRecords\(invitation\.sessionToken\),\s+storeClick\(invitation\)\.catch\(\(\) => \{\}\)\s+\]\);[\s\S]+?const preferences = await getPlatformPreferences\(invitation\.sessionToken\);/g;

if (regex.test(js)) {
  const replacement = (match) => {
    let replaced = match.replace('const [quiz, records] = await Promise.all([', 'const [quiz, records, preferences] = await Promise.all([');
    replaced = replaced.replace('storeClick(invitation).catch(() => {})', 'storeClick(invitation).catch(() => {}),\n          getPlatformPreferences(invitation.sessionToken)');
    replaced = replaced.replace(/const preferences = await getPlatformPreferences\(invitation\.sessionToken\);/, '');
    return replaced;
  };
  js = js.replace(regex, replacement);
  fs.writeFileSync(path, js, 'utf8');
  console.log('Fixed preferences load');
} else {
  console.log('Preferences regex not matched');
}
