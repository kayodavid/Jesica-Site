const fs = require('fs');
const path = 'c:/Users/kayod/Downloads/projeto_jesica_atualizado/questionnaire-email.js';
let js = fs.readFileSync(path, 'utf8');

const regex = /const invitation = decryptInvitation\(String\(body\.token \|\| ''\)\);[\s\r\n]+await storeClick\(invitation\);[\s\r\n]+const quiz = await loadQuiz\(invitation\.sessionToken, invitation\.quizId\);[\s\r\n]+const records = await listStoredQuestionnaireRecords\(invitation\.sessionToken\);/g;

const replacement = `const invitation = decryptInvitation(String(body.token || ''));
        const [quiz, records] = await Promise.all([
          loadQuiz(invitation.sessionToken, invitation.quizId),
          listStoredQuestionnaireRecords(invitation.sessionToken),
          storeClick(invitation).catch(() => {})
        ]);`;

if (regex.test(js)) {
  js = js.replace(regex, replacement);
  fs.writeFileSync(path, js, 'utf8');
  console.log('Fixed parallel load using regex');
} else {
  console.log('Not matched by regex');
}
