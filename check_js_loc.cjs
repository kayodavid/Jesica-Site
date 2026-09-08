const fs = require('fs');
const html = fs.readFileSync('c:/Users/kayod/Downloads/projeto_jesica_atualizado/admin-espaco-paciente.html', 'utf8');
const lines = html.split('\n');
const start = lines.findIndex(l => l.includes('quiz-reorder-trigger'));
console.log(lines.slice(start - 25, start + 25).join('\n'));
