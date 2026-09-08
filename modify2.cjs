const fs = require('fs');
const path = 'c:/Users/kayod/Downloads/projeto_jesica_atualizado/responder-questionario.html';
let html = fs.readFileSync(path, 'utf8');

const oldFn = "return{active:c.active!==false,required:c.required===undefined?fb:c.required!==false,weight:Number.isFinite(w)&&w>=1&&w<=5?w:1};";
const newFn = "return{active:c.active!==false,required:c.required===undefined?fb:c.required!==false,weight:Number.isFinite(w)&&w>=1&&w<=5?w:1,visible:c.visible!==false};";

if (html.includes(oldFn)) {
  html = html.replace(oldFn, newFn);
  fs.writeFileSync(path, html, 'utf8');
  console.log('Modified scoreCfg');
} else {
  console.log('Not found');
}
