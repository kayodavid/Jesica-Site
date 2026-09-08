const fs = require('fs');
const path = 'c:/Users/kayod/Downloads/projeto_jesica_atualizado/admin-espaco-paciente.html';
let content = fs.readFileSync(path, 'utf8');

const strToRemove = '<a href="#scheduled-sends" data-admin-nav="envios-programados"><svg class="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2Z"/></svg>Envios programados</a>';

if (content.includes(strToRemove)) {
  content = content.replace(strToRemove, '');
  fs.writeFileSync(path, content, 'utf8');
  console.log('Removed sidebar link.');
} else {
  console.log('Could not find the exact string to remove.');
}
