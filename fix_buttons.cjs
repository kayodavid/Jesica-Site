const fs = require('fs');
const path = 'c:/Users/kayod/Downloads/projeto_jesica_atualizado/admin-espaco-paciente.html';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(/const canPause = !statusInfo\.isSent && \['agendado_na_brevo', 'aguardando_brevo'\]\.includes\(statusInfo\.key\);/g, "const isFut = isFutureSchedule(schedule);\n          const canPause = isFut && !statusInfo.isSent && ['agendado_na_brevo', 'aguardando_brevo'].includes(statusInfo.key);");

content = content.replace(/const canResume = !statusInfo\.isSent && statusInfo\.key === 'pausado';/g, "const canResume = isFut && !statusInfo.isSent && statusInfo.key === 'pausado';");

content = content.replace(/const canCancel = !statusInfo\.isSent && \['agendado_na_brevo', 'aguardando_brevo', 'pausado'\]\.includes\(statusInfo\.key\);/g, "const canCancel = isFut && !statusInfo.isSent && ['agendado_na_brevo', 'aguardando_brevo', 'pausado'].includes(statusInfo.key);");

fs.writeFileSync(path, content, 'utf8');
console.log('Fixed action buttons for past schedules.');
