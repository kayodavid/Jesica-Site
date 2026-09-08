const fs = require('fs');
const html = fs.readFileSync('c:/Users/kayod/Downloads/projeto_jesica_atualizado/admin-espaco-paciente.html', 'utf8');
const lines = html.split('\n');
lines.forEach((l, i) => { if (l.includes('quiz-settings-section')) console.log((i+1) + ': ' + l.trim().substring(0, 150)); });
