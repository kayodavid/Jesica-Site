const fs = require('fs');
const content = fs.readFileSync('c:/Users/kayod/Downloads/projeto_jesica_atualizado/dist/admin-espaco-paciente.html', 'utf8');
if (content.includes('Envios programados')) console.log('Found in dist HTML');
else console.log('NOT found in dist HTML');
