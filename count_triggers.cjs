const fs = require('fs');
const html = fs.readFileSync('c:/Users/kayod/Downloads/projeto_jesica_atualizado/admin-espaco-paciente.html', 'utf8');
const count = html.split('id="quiz-reorder-trigger"').length - 1;
console.log('Matches:', count);
