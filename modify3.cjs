const fs = require('fs');
const path = 'c:/Users/kayod/Downloads/projeto_jesica_atualizado/responder-questionario.html';
let html = fs.readFileSync(path, 'utf8');

const oldLine = 'const qs=snaps.map(q=>({...q,required:scoreCfg(quiz,q).required}));quiz.questionSnapshots=qs;';
const newLine = 'const qs=snaps.filter(q=>scoreCfg(quiz,q).visible).map(q=>({...q,required:scoreCfg(quiz,q).required}));quiz.questionSnapshots=qs;';

if (html.includes(oldLine)) {
  html = html.replace(oldLine, newLine);
  fs.writeFileSync(path, html, 'utf8');
  console.log('Modified question filtering in responder-questionario.html');
} else {
  console.log('Not found');
}
