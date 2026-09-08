const fs = require('fs');
const path = 'c:/Users/kayod/Downloads/projeto_jesica_atualizado/admin-espaco-paciente.html';
let html = fs.readFileSync(path, 'utf8');

const oldStr = '<span class="text-[11px] text-gray-500">Perguntas ativas compõem o score final.</span>';
const newStr = '<button id="quiz-reorder-trigger" type="button" class="inline-flex items-center gap-1 rounded bg-primary/10 px-2 py-1 text-[11px] font-bold text-primary hover:bg-primary/20"><svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/></svg>Reordenar</button>';

if (html.includes(oldStr)) {
  html = html.replace(oldStr, newStr);
  fs.writeFileSync(path, html, 'utf8');
  console.log('Injected button');
} else {
  console.log('Old string not found');
}
