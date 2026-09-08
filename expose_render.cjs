const fs = require('fs');
const path = 'c:/Users/kayod/Downloads/projeto_jesica_atualizado/admin-espaco-paciente.html';
let html = fs.readFileSync(path, 'utf8');

const searchTarget = 'reorderList.appendChild(item);\n        });\n      };';
const replacement = 'reorderList.appendChild(item);\n        });\n      };\n      window._renderReorderModal = renderReorderModal;';

if (html.includes(searchTarget)) {
  html = html.replace(searchTarget, replacement);
  fs.writeFileSync(path, html, 'utf8');
  console.log('Successfully exposed _renderReorderModal');
} else {
  console.log('Could not find searchTarget');
}
