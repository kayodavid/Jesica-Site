const fs = require('fs');
const path = 'c:/Users/kayod/Downloads/projeto_jesica_atualizado/admin-espaco-paciente.html';
let content = fs.readFileSync(path, 'utf8');

// Insert HTML
const htmlToInsert = `
  <div id="clinicpro-confirm-modal" class="fixed inset-0 z-[140] flex items-center justify-center bg-dark/40 px-4 py-6 backdrop-blur-[2px] transition-all opacity-0 pointer-events-none" aria-hidden="true">
    <div class="relative w-full max-w-sm scale-95 transform rounded-3xl bg-white p-6 shadow-2xl transition-all clinicpro-confirm-box">
      <div class="flex items-start gap-4">
        <div class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600 clinicpro-confirm-icon-bg">
          <svg class="h-6 w-6 clinicpro-confirm-icon" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <div class="pt-1">
          <h3 id="clinicpro-confirm-title" class="text-lg font-bold text-dark">Confirmação</h3>
          <p id="clinicpro-confirm-message" class="mt-2 text-sm text-gray-500"></p>
        </div>
      </div>
      <div class="mt-6 flex justify-end gap-3">
        <button type="button" id="clinicpro-confirm-cancel" class="rounded-xl px-4 py-2 text-sm font-bold text-dark hover:bg-gray-100 transition-colors">Cancelar</button>
        <button type="button" id="clinicpro-confirm-ok" class="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 transition-colors">Confirmar</button>
      </div>
    </div>
  </div>
`;
content = content.replace(/<div id="admin-toast" class="admin-toast" role="status" aria-live="polite"><\/div>/, match => match + '\n' + htmlToInsert);

// Insert JS
const jsToInsert = `
    window.showClinicProConfirm = function(message) {
      return new Promise(resolve => {
        const modal = document.getElementById('clinicpro-confirm-modal');
        const msgEl = document.getElementById('clinicpro-confirm-message');
        const btnCancel = document.getElementById('clinicpro-confirm-cancel');
        const btnOk = document.getElementById('clinicpro-confirm-ok');

        msgEl.textContent = message || 'Tem certeza?';
        
        const cleanup = () => {
          modal.classList.remove('opacity-100', 'pointer-events-auto');
          modal.classList.add('opacity-0', 'pointer-events-none');
          btnCancel.removeEventListener('click', onCancel);
          btnOk.removeEventListener('click', onOk);
        };

        const onCancel = () => { cleanup(); resolve(false); };
        const onOk = () => { cleanup(); resolve(true); };

        btnCancel.addEventListener('click', onCancel);
        btnOk.addEventListener('click', onOk);

        modal.classList.remove('opacity-0', 'pointer-events-none');
        modal.classList.add('opacity-100', 'pointer-events-auto');
      });
    };

    window.confirm = function(message) {
      console.warn("clinicpro: window.confirm foi interceptado. Use window.showClinicProConfirm assíncrono. Bloqueando chamada original.", message);
      return false; // Blocker fallback just in case
    };

    window.alert = function(message) {
      console.warn("clinicpro: window.alert foi interceptado.", message);
      if (typeof notify === 'function') {
        notify(message, 'error');
      }
    };
`;
content = content.replace(/(\/\/ Conteúdo normalizado da biblioteca de perguntas coletado em sessão autenticada somente para leitura\.)/, match => jsToInsert + '\n    ' + match);

// Replace window.confirm
content = content.replace(/if \(!window\.confirm\((.*?)\)\) return;/g, (match, p1) => {
  return `if (!(await window.showClinicProConfirm(${p1}))) return;`;
});
content = content.replace(/if \(!rule \|\| !window\.confirm\((.*?)\)\) return;/g, (match, p1) => {
  return `if (!rule || !(await window.showClinicProConfirm(${p1}))) return;`;
});

// Replace alert
content = content.replace(/alert\((.*?)\);/g, (match, p1) => {
  return `notify(${p1}, 'error');`;
});

fs.writeFileSync(path, content, 'utf8');
console.log('Replaced successfully.');
