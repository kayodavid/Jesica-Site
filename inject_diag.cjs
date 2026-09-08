const fs = require('fs');
const path = 'c:/Users/kayod/Downloads/projeto_jesica_atualizado/admin-espaco-paciente.html';
let html = fs.readFileSync(path, 'utf8');

const search = 'reorderList.innerHTML = \'\';';
const replace = `
        reorderList.innerHTML = '';
        if (!questions || !questions.length) {
            reorderList.innerHTML = '<p class="text-red-500">Erro: array questions está vazio.</p>';
            return;
        }
        if (!selectedIds || selectedIds.size === 0) {
            reorderList.innerHTML = '<p class="text-red-500">Erro: selectedIds está vazio.</p>';
            return;
        }
        const selected = getSelectedQuestions();
        if (selected.length === 0) {
            reorderList.innerHTML = '<p class="text-red-500">Erro: getSelectedQuestions() retornou 0 itens.</p>';
            return;
        }
`;

if (html.includes(search)) {
    html = html.replace(search, replace);
    fs.writeFileSync(path, html, 'utf8');
    console.log('Injected diagnostic UI.');
} else {
    console.log('Search string not found.');
}
