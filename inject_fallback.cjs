const fs = require('fs');
const path = 'c:/Users/kayod/Downloads/projeto_jesica_atualizado/admin-espaco-paciente.html';
let html = fs.readFileSync(path, 'utf8');

const search = 'if (window._renderReorderModal) {\n        window._renderReorderModal();\n      }';
const replace = `
      if (window._renderReorderModal) {
        try { window._renderReorderModal(); } catch (err) { modal.querySelector('#quiz-reorder-list').innerHTML = '<p class="text-red-500">Exceção interna: ' + err.message + '</p>'; }
      } else {
        modal.querySelector('#quiz-reorder-list').innerHTML = '<p class="text-red-500">Erro: _renderReorderModal não está definido no window.</p>';
      }
`;

if (html.includes(search)) {
    html = html.replace(search, replace);
    fs.writeFileSync(path, html, 'utf8');
    console.log('Injected fallback diagnostic UI.');
} else {
    console.log('Search string not found.');
}
