const fs = require('fs');
const html = fs.readFileSync('c:/Users/kayod/Downloads/projeto_jesica_atualizado/admin-espaco-paciente.html', 'utf8');
const lines = html.split('\n');
const start = lines.findIndex(l => l.includes('id="quiz-reorder-modal"'));
console.log(lines.slice(start - 5, start + 5).join('\n'));
