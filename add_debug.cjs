const fs = require('fs');
const html = fs.readFileSync('c:/Users/kayod/Downloads/projeto_jesica_atualizado/admin-espaco-paciente.html', 'utf8');

const oldCode = `      const trigger = document.getElementById('quiz-reorder-trigger');
      if (trigger) {
        trigger.addEventListener('click', () => {
          renderReorderModal();
          reorderModal.classList.remove('opacity-0', 'pointer-events-none');
          reorderModal.removeAttribute('aria-hidden');
        });
      }`;

const newCode = `      const trigger = document.getElementById('quiz-reorder-trigger');
      if (trigger) {
        trigger.addEventListener('click', (event) => {
          event.preventDefault();
          console.log('Quiz reorder trigger clicked!');
          if (!reorderModal) { alert('Modal not found'); return; }
          try {
            renderReorderModal();
            reorderModal.classList.remove('opacity-0', 'pointer-events-none');
            reorderModal.removeAttribute('aria-hidden');
          } catch (e) {
            alert('Error rendering modal: ' + e.message);
          }
        });
      }`;

const result = html.replace(oldCode, newCode);
fs.writeFileSync('c:/Users/kayod/Downloads/projeto_jesica_atualizado/admin-espaco-paciente.html', result, 'utf8');
console.log(html !== result ? 'Replaced' : 'Not replaced');
