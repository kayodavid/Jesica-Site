const fs = require('fs');
const path = 'c:/Users/kayod/Downloads/projeto_jesica_atualizado/responder-questionario.html';
let html = fs.readFileSync(path, 'utf8');

const oldLine = "try{await req('click',{token},{keepalive:true});}catch{}";
const newLine = "req('click',{token},{keepalive:true}).catch(()=>{});";

if (html.includes(oldLine)) {
  html = html.replace(oldLine, newLine);
  fs.writeFileSync(path, html, 'utf8');
  console.log('Fixed await click in responder-questionario.html');
} else {
  console.log('Could not find oldLine in responder-questionario.html');
}
