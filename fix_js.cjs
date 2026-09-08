const fs = require('fs');
const path = 'c:/Users/kayod/Downloads/projeto_jesica_atualizado/questionnaire-email.js';
let js = fs.readFileSync(path, 'utf8');

const oldLines = `        const invitation = decryptInvitation(String(body.token || ''));
        await storeClick(invitation);
        const quiz = await loadQuiz(invitation.sessionToken, invitation.quizId);
        const records = await listStoredQuestionnaireRecords(invitation.sessionToken);`;

const newLines = `        const invitation = decryptInvitation(String(body.token || ''));
        const [quiz, records] = await Promise.all([
          loadQuiz(invitation.sessionToken, invitation.quizId),
          listStoredQuestionnaireRecords(invitation.sessionToken),
          storeClick(invitation).catch(() => {})
        ]);`;

if (js.includes(oldLines)) {
  js = js.replace(oldLines, newLines);
  fs.writeFileSync(path, js, 'utf8');
  console.log('Fixed parallel load in questionnaire-email.js');
} else {
  console.log('Could not find oldLines in questionnaire-email.js');
}
