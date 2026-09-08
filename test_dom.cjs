const fs = require('fs');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;

const html = fs.readFileSync('c:/Users/kayod/Downloads/projeto_jesica_atualizado/admin-espaco-paciente.html', 'utf8');

const dom = new JSDOM(html, { runScripts: "dangerously" });

setTimeout(() => {
  const trigger = dom.window.document.getElementById('quiz-reorder-trigger');
  if (!trigger) {
    console.log('Trigger not found!');
  } else {
    console.log('Trigger found. Clicking...');
    trigger.click();
    
    const modal = dom.window.document.getElementById('quiz-reorder-modal');
    console.log('Modal classes after click:', modal.className);
    console.log('Modal aria-hidden:', modal.getAttribute('aria-hidden'));
  }
}, 1000);
