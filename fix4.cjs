const fs = require('fs');
const path = 'c:/Users/kayod/Downloads/projeto_jesica_atualizado/admin-espaco-paciente.html';
let html = fs.readFileSync(path, 'utf8');

html = html.replace('const selected = getSelectedQuestions();\n        if (selected.length === 0) {', 'const selectedList = getSelectedQuestions();\n        if (selectedList.length === 0) {');

fs.writeFileSync(path, html, 'utf8');
console.log('Fixed selected duplicate');
