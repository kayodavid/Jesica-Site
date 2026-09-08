const fs = require('fs');
const path = 'c:/Users/kayod/Downloads/projeto_jesica_atualizado/admin-espaco-paciente.html';
let html = fs.readFileSync(path, 'utf8');

const jsInject = `
      const reorderModal = document.getElementById('quiz-reorder-modal');
      const reorderList = document.getElementById('quiz-reorder-list');
      const renderReorderModal = () => {
        reorderList.innerHTML = '';
        const selected = getSelectedQuestions();
        selected.forEach((question, index) => {
          const item = document.createElement('div');
          item.className = 'flex items-center gap-3 p-3 rounded-lg border border-primary/10 bg-white shadow-sm cursor-move';
          item.draggable = true;
          item.innerHTML = \`<span class="text-gray-400">⠿</span><span class="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-primary/[.08] text-xs font-bold text-dark">\${index + 1}</span><span class="text-sm font-semibold text-dark truncate">\${escape(question.title)}</span>\`;
          
          item.addEventListener('dragstart', event => {
            draggedQuestionId = String(question.id);
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', String(question.id));
            window.requestAnimationFrame(() => item.classList.add('opacity-50'));
          });
          item.addEventListener('dragend', () => {
            draggedQuestionId = null;
            reorderList.querySelectorAll('div').forEach(el => el.classList.remove('opacity-50', 'border-t-2', 'border-b-2', 'border-primary'));
          });
          item.addEventListener('dragover', event => {
            if (!draggedQuestionId || draggedQuestionId === String(question.id)) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            const bounds = item.getBoundingClientRect();
            const isBottom = event.clientY > bounds.top + bounds.height / 2;
            item.classList.remove('border-t-2', 'border-b-2', 'border-primary');
            item.classList.add(isBottom ? 'border-b-2' : 'border-t-2', 'border-primary');
          });
          item.addEventListener('dragleave', () => {
            item.classList.remove('border-t-2', 'border-b-2', 'border-primary');
          });
          item.addEventListener('drop', event => {
            if (!draggedQuestionId || draggedQuestionId === String(question.id)) return;
            event.preventDefault();
            const sourceId = draggedQuestionId;
            draggedQuestionId = null;
            const bounds = item.getBoundingClientRect();
            reorderSelectedQuestions(sourceId, String(question.id), event.clientY > bounds.top + bounds.height / 2);
            renderReorderModal();
            renderSettings();
          });
          reorderList.appendChild(item);
        });
      };
      
      const trigger = document.getElementById('quiz-reorder-trigger');
      if (trigger) {
        trigger.addEventListener('click', () => {
          renderReorderModal();
          reorderModal.classList.remove('opacity-0', 'pointer-events-none');
          reorderModal.removeAttribute('aria-hidden');
        });
      }
      document.getElementById('quiz-reorder-close').addEventListener('click', () => {
        reorderModal.classList.add('opacity-0', 'pointer-events-none');
        reorderModal.setAttribute('aria-hidden', 'true');
      });
      document.getElementById('quiz-reorder-done').addEventListener('click', () => {
        reorderModal.classList.add('opacity-0', 'pointer-events-none');
        reorderModal.setAttribute('aria-hidden', 'true');
      });
`;

if (html.includes('return { open, refresh, openSchedule:openLinkedSchedule, openLinkedDrawer, openForPatient };')) {
  html = html.replace('return { open, refresh, openSchedule:openLinkedSchedule, openLinkedDrawer, openForPatient };', jsInject + '\n      return { open, refresh, openSchedule:openLinkedSchedule, openLinkedDrawer, openForPatient };');
  fs.writeFileSync(path, html, 'utf8');
  console.log('Injected JS successfully.');
} else {
  console.log('Could not find JS injection point.');
}
