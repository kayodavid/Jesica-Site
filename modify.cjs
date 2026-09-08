const fs = require('fs');
const path = 'c:/Users/kayod/Downloads/projeto_jesica_atualizado/admin-espaco-paciente.html';
let html = fs.readFileSync(path, 'utf8');

let oldStr = '`<div class="flex flex-wrap items-center gap-x-5 gap-y-2"><label class="inline-flex items-center gap-2 text-xs font-semibold text-dark"><input type="checkbox" class="h-4 w-4 accent-primary quiz-active" ${config.active !== false ? \'checked\' : \'\'}>Incluir no score</label><label class="inline-flex items-center gap-2 text-xs font-semibold text-dark"><input type="checkbox" class="h-4 w-4 accent-primary quiz-required" ${config.required !== false ? \'checked\' : \'\'}>Pergunta obrigatória</label></div><div class="flex items-center gap-2"><span class="text-xs font-bold text-dark">Peso</span>${scoreControl}</div>` : `<label class="inline-flex items-center gap-2 text-xs font-semibold text-dark"><input type="checkbox" class="h-4 w-4 accent-primary quiz-required" ${config.required !== false ? \'checked\' : \'\'}>Pergunta obrigatória</label>`';

let newStr = '`<div class="flex flex-wrap items-center gap-x-5 gap-y-2"><label class="inline-flex items-center gap-2 text-xs font-semibold text-dark"><input type="checkbox" class="h-4 w-4 accent-primary quiz-visible" ${config.visible !== false ? \'checked\' : \'\'}>Exibir pergunta</label><label class="inline-flex items-center gap-2 text-xs font-semibold text-dark"><input type="checkbox" class="h-4 w-4 accent-primary quiz-active" ${config.active !== false ? \'checked\' : \'\'}>Incluir no score</label><label class="inline-flex items-center gap-2 text-xs font-semibold text-dark"><input type="checkbox" class="h-4 w-4 accent-primary quiz-required" ${config.required !== false ? \'checked\' : \'\'}>Pergunta obrigatória</label></div><div class="flex items-center gap-2"><span class="text-xs font-bold text-dark">Peso</span>${scoreControl}</div>` : `<div class="flex flex-wrap items-center gap-x-5 gap-y-2"><label class="inline-flex items-center gap-2 text-xs font-semibold text-dark"><input type="checkbox" class="h-4 w-4 accent-primary quiz-visible" ${config.visible !== false ? \'checked\' : \'\'}>Exibir pergunta</label><label class="inline-flex items-center gap-2 text-xs font-semibold text-dark"><input type="checkbox" class="h-4 w-4 accent-primary quiz-required" ${config.required !== false ? \'checked\' : \'\'}>Pergunta obrigatória</label></div>`';

if (html.includes(oldStr)) {
  html = html.replace(oldStr, newStr);
  console.log('Replaced HTML template successfully.');
} else {
  console.log('Did not find HTML string.');
}

let oldList = 'row.querySelector(\'.quiz-required\').addEventListener(\'change\', event => { selectedSettings[qKey].required = event.target.checked; });';
let newList = oldList + ' row.querySelector(\'.quiz-visible\').addEventListener(\'change\', event => { selectedSettings[qKey].visible = event.target.checked; });';

if (html.includes(oldList)) {
  html = html.replace(oldList, newList);
  console.log('Replaced event listener successfully.');
} else {
  console.log('Did not find listener string.');
}

fs.writeFileSync(path, html, 'utf8');
