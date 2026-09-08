const fs = require('fs');
const path = 'c:/Users/kayod/Downloads/projeto_jesica_atualizado/questionnaire-email.js';
let js = fs.readFileSync(path, 'utf8');

js = js.replace(
  `} catch (error) {\n        return json(res, 200, { state: /expirado/i.test(error.message) ? 'expired' : 'invalid' });\n      }`,
  `} catch (error) {\n        return json(res, 200, { state: /expirado/i.test(error.message) ? 'expired' : 'invalid', error_message: error.message, stack: error.stack });\n      }`
);

fs.writeFileSync(path, js, 'utf8');
console.log('Injected error logging');
