const fs = require('fs');
const content = fs.readFileSync('c:/Users/kayod/Downloads/projeto_jesica_atualizado/admin-espaco-paciente.html', 'utf8');
const matches = content.match(/data-admin-nav="envios-programados"/g);
console.log('Matches:', matches ? matches.length : 0);
