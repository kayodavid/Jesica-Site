const fs = require('fs');
const js = fs.readFileSync('c:/Users/kayod/Downloads/projeto_jesica_atualizado/questionnaire-email.js', 'utf8');

const oldLine = 'quiz.questionSnapshots = quiz.questionSnapshots.map(snapshot => hydrateQuestionSnapshot(snapshot, questionsById.get(String(snapshot?.id || \'\'))));';
const newLine = `quiz.questionSnapshots = quiz.questionSnapshots.map(snapshot => hydrateQuestionSnapshot(snapshot, questionsById.get(String(snapshot?.id || ''))));
    quiz.questionSnapshots = quiz.questionSnapshots.filter(q => {
      const cfg = quiz.questionSettings?.[q.id] || {};
      return cfg.visible !== false;
    });`;

if (js.includes(oldLine)) {
  const result = js.replace(oldLine, newLine);
  fs.writeFileSync('c:/Users/kayod/Downloads/projeto_jesica_atualizado/questionnaire-email.js', result, 'utf8');
  console.log('Updated questionnaire-email.js successfully.');
} else {
  console.log('Not found in questionnaire-email.js');
}
