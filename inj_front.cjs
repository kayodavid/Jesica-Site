const fs = require('fs');
const path = 'c:/Users/kayod/Downloads/projeto_jesica_atualizado/responder-questionario.html';
let html = fs.readFileSync(path, 'utf8');

const search = `        return showState('error','Convite indisponível','Este convite não está disponível. Solicite um novo link à Dra. Jessica.');`;
const replace = `        return showState('error','Convite indisponível','Erro técnico: ' + (inv.error_message || 'Desconhecido') + ' - ' + (inv.stack || ''));`;

if (html.includes(search)) {
  html = html.replace(search, replace);
  fs.writeFileSync(path, html, 'utf8');
  console.log('Injected frontend error display');
} else {
  console.log('Search not found');
}
