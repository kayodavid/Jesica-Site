const fs = require('fs');
const html = fs.readFileSync('c:/Users/kayod/Downloads/projeto_jesica_atualizado/admin-espaco-paciente.html', 'utf8');
const match = html.match(/<section id="admin-quiz-editor"[\s\S]*?<section id="quiz-settings-section/);
if (match) console.log(match[0].substring(0, 1500));
