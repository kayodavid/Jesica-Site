const fs = require('fs');
const content = fs.readFileSync('c:/Users/kayod/Downloads/projeto_jesica_atualizado/dist/admin-espaco-paciente.html', 'utf8');
const regex = /.{0,30}Envios programados.{0,30}/g;
let match;
while ((match = regex.exec(content)) !== null) {
  console.log(match[0]);
}
