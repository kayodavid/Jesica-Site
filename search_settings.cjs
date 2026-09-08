const fs = require('fs');
const html = fs.readFileSync('c:/Users/kayod/Downloads/projeto_jesica_atualizado/admin-espaco-paciente.html', 'utf8');
const lines = html.split('\n');
const startIndex = lines[1846].indexOf('<section id="quiz-settings-section"');
if (startIndex !== -1) {
  console.log(lines[1846].substring(startIndex, startIndex + 1500));
}
