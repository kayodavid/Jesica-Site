const fs = require('fs');
const content = fs.readFileSync('c:/Users/kayod/Downloads/projeto_jesica_atualizado/admin-espaco-paciente.html', 'utf8');
const lines = content.split('\n');
lines.forEach((line, i) => {
  if (line.includes('>Envios programados<')) console.log((i+1) + ': ' + line.trim());
});
