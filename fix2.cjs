const fs = require('fs');
const path = 'c:/Users/kayod/Downloads/projeto_jesica_atualizado/admin-espaco-paciente.html';
let html = fs.readFileSync(path, 'utf8');
const lines = html.split('\n');

const start = lines.findIndex(l => l.includes('if (!selectedIds || selectedIds.size === 0) {'));
if (start > -1) {
  lines[start + 3] = '        const selectedList = getSelectedQuestions();';
  lines[start + 4] = '        if (selectedList.length === 0) {';
  lines[start + 8] = '        const selected = getSelectedQuestions();';
  fs.writeFileSync(path, lines.join('\n'), 'utf8');
  console.log('Fixed duplicate by renaming the first one to selectedList');
}
