const fs = require('fs');
const path = 'c:/Users/kayod/Downloads/projeto_jesica_atualizado/admin-espaco-paciente.html';
let html = fs.readFileSync(path, 'utf8');

const modalHTML = `
  <div id="quiz-reorder-modal" class="fixed inset-0 z-[140] flex items-center justify-center bg-dark/40 px-4 py-6 backdrop-blur-[2px] transition-all opacity-0 pointer-events-none" aria-hidden="true">
    <div class="relative w-full max-w-md scale-95 transform rounded-3xl bg-white p-6 shadow-2xl transition-all clinicpro-confirm-box flex flex-col max-h-full">
      <div class="flex items-start justify-between">
        <h3 class="text-lg font-bold text-dark">Reordenar Perguntas</h3>
        <button type="button" id="quiz-reorder-close" class="text-gray-400 hover:text-dark">
          <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <p class="mt-2 text-sm text-gray-500 shrink-0">Arraste os itens abaixo para definir a ordem das perguntas.</p>
      
      <div id="quiz-reorder-list" class="mt-4 flex-1 overflow-y-auto space-y-2"></div>
      
      <div class="mt-6 flex justify-end gap-3 shrink-0">
        <button type="button" id="quiz-reorder-done" class="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white hover:bg-primary/90 transition-colors">Concluído</button>
      </div>
    </div>
  </div>
`;

if (!html.includes('quiz-reorder-modal')) {
  html = html.replace('  <div id="admin-toast"', modalHTML + '\n  <div id="admin-toast"');
  fs.writeFileSync(path, html, 'utf8');
  console.log('Injected modal HTML');
} else {
  console.log('Modal already injected');
}
