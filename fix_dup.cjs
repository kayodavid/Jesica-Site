const fs = require('fs');
const path = 'c:/Users/kayod/Downloads/projeto_jesica_atualizado/admin-espaco-paciente.html';
let html = fs.readFileSync(path, 'utf8');

// I duplicated `const selected = getSelectedQuestions();`
const search = `
        const selected = getSelectedQuestions();
        if (selected.length === 0) {
            reorderList.innerHTML = '<p class=\"text-red-500\">Erro: getSelectedQuestions() retornou 0 itens.</p>';
            return;
        }
        const selected = getSelectedQuestions();
`;
const replace = `
        const selected = getSelectedQuestions();
        if (selected.length === 0) {
            reorderList.innerHTML = '<p class=\"text-red-500\">Erro: getSelectedQuestions() retornou 0 itens.</p>';
            return;
        }
`;

if (html.includes('const selected = getSelectedQuestions();\n        const selected')) {
   html = html.replace('const selected = getSelectedQuestions();\n        const selected', 'const selected');
}
// more robust replacement:
html = html.replace(/const selected = getSelectedQuestions\(\);\s+const selected = getSelectedQuestions\(\);/, 'const selected = getSelectedQuestions();');

fs.writeFileSync(path, html, 'utf8');
console.log('Fixed duplicate declaration.');
