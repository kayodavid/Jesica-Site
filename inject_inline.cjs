const fs = require('fs');
const path = 'c:/Users/kayod/Downloads/projeto_jesica_atualizado/admin-espaco-paciente.html';
let html = fs.readFileSync(path, 'utf8');

// 1. Add onclick attribute to the button
const buttonRegex = /<button id="quiz-reorder-trigger" type="button" class="([^"]+)">/g;
html = html.replace(buttonRegex, '<button id="quiz-reorder-trigger" type="button" onclick="if(window.openReorderModal) window.openReorderModal();" class="$1">');

// 2. Add the global function at the end of the file, right before </body>
const globalScript = `
<script>
window.openReorderModal = function() {
  try {
    const modal = document.getElementById('quiz-reorder-modal');
    if (modal) {
      // Force display block just in case
      modal.style.display = 'flex';
      modal.classList.remove('hidden', 'opacity-0', 'pointer-events-none');
      modal.classList.add('opacity-100', 'pointer-events-auto');
      modal.removeAttribute('aria-hidden');
      
      // Also try to trigger the internal render if available
      if (window._renderReorderModal) {
        window._renderReorderModal();
      }
    } else {
      alert('Modal não encontrado no HTML!');
    }
  } catch (err) {
    alert('Erro ao abrir modal: ' + err.message);
  }
};
window.closeReorderModal = function() {
  const modal = document.getElementById('quiz-reorder-modal');
  if (modal) {
    modal.classList.add('opacity-0', 'pointer-events-none');
    modal.classList.remove('opacity-100', 'pointer-events-auto');
    modal.setAttribute('aria-hidden', 'true');
  }
};
</script>
`;

html = html.replace('</body>', globalScript + '\n</body>');

// 3. Fix the modal's cancel/done buttons to use the new global function
html = html.replace(/id="quiz-reorder-close"/g, 'id="quiz-reorder-close" onclick="if(window.closeReorderModal) window.closeReorderModal();"');
html = html.replace(/id="quiz-reorder-done"/g, 'id="quiz-reorder-done" onclick="if(window.closeReorderModal) window.closeReorderModal();"');

fs.writeFileSync(path, html, 'utf8');
console.log('Successfully injected global inline handlers.');
