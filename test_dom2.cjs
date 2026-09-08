const fs = require('fs');
const jsdom = require("jsdom");
const { JSDOM, VirtualConsole } = jsdom;

const html = fs.readFileSync('c:/Users/kayod/Downloads/projeto_jesica_atualizado/admin-espaco-paciente.html', 'utf8');

const virtualConsole = new VirtualConsole();
virtualConsole.on("log", (message) => { console.log("JSDOM LOG:", message); });
virtualConsole.on("jsdomError", (error) => { console.error("JSDOM ERROR:", error.stack, error.detail); });
virtualConsole.on("error", (message) => { console.error("JSDOM CONSOLE ERROR:", message); });

const dom = new JSDOM(html, { runScripts: "dangerously", virtualConsole });

dom.window.alert = (msg) => { console.log("JSDOM ALERT:", msg); };

setTimeout(() => {
  const trigger = dom.window.document.getElementById('quiz-reorder-trigger');
  if (trigger) {
    console.log('Trigger found. Clicking...');
    trigger.click();
    
    const modal = dom.window.document.getElementById('quiz-reorder-modal');
    console.log('Classes:', modal.className);
  }
}, 2000);
