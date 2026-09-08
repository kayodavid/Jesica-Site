const fs = require('fs');
const dir = 'c:/Users/kayod/Downloads/projeto_jesica_atualizado';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.html') && !f.endsWith('.bak'));
files.forEach(f => {
  const content = fs.readFileSync(dir + '/' + f, 'utf8');
  if (content.includes('Envios programados')) console.log(f + ' contains it');
  if (content.includes('data-admin-nav="envios-programados"')) console.log(f + ' contains data-admin-nav');
});
