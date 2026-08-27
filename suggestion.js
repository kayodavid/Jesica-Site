const SUPABASE_URL = 'https://mcsilxhgwbxtvydytjcx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_PKWZS9Za2vfbGCvKNcquow_zuymCA72';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.end(JSON.stringify(body));
}

async function callRpc(name, body) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  let value = text;
  try { value = JSON.parse(text); } catch {}
  if (!response.ok) throw new Error(typeof value === 'string' ? value : (value?.message || `Supabase RPC ${response.status}`));
  return value;
}

async function requireAdmin(sessionToken) {
  if (!String(sessionToken || '').trim()) throw new Error('Sua sessão administrativa expirou. Entre novamente.');
  const current = await callRpc('app_current_user', { p_token: String(sessionToken).trim() });
  const user = Array.isArray(current) ? current[0] : current;
  if (!user || String(user.role || '').toLowerCase() !== 'admin') throw new Error('Sua sessão administrativa expirou. Entre novamente.');
  return user;
}

function cleanText(value, maxLength) {
  return String(value ?? '').replace(/\u0000/g, '').trim().slice(0, maxLength);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[character]);
}

function configuredRecipients() {
  return String(process.env.SUGGESTION_RECIPIENTS || '')
    .split(/[\s,;]+/)
    .map(value => value.trim().toLowerCase())
    .filter((value, index, values) => EMAIL_PATTERN.test(value) && values.indexOf(value) === index)
    .slice(0, 5);
}

async function sendSuggestionEmail({ name, phone, email, suggestion }) {
  const apiKey = process.env.BREVO_API_KEY;
  const recipients = configuredRecipients();
  if (!apiKey || !recipients.length) throw new Error('Suggestion email is not configured.');
  const senderEmail = process.env.BREVO_SENDER_EMAIL || 'contato@jessicamelonutri.com.br';
  const senderName = process.env.BREVO_SENDER_NAME || 'Jessica Melo Nutricionista';
  const submittedAt = new Intl.DateTimeFormat('pt-BR', { dateStyle:'short', timeStyle:'short', timeZone:'America/Sao_Paulo' }).format(new Date());
  const htmlContent = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#faf8f3;color:#3d3226;font-family:Arial,Helvetica,sans-serif;line-height:1.55"><div style="max-width:680px;margin:0 auto;padding:28px 20px"><div style="border:1px solid #eadfca;border-radius:16px;background:#fff;padding:24px"><p style="margin:0;color:#a88b36;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase">Sugestão recebida</p><h1 style="margin:8px 0 20px;font-size:24px;color:#3d3226">Nova sugestão para a plataforma</h1><p style="margin:0 0 18px"><strong>Data:</strong> ${escapeHtml(submittedAt)}</p><table style="width:100%;border-collapse:collapse;font-size:14px"><tr><td style="width:130px;padding:9px 0;border-bottom:1px solid #eee5d5"><strong>Nome</strong></td><td style="padding:9px 0;border-bottom:1px solid #eee5d5">${escapeHtml(name)}</td></tr><tr><td style="padding:9px 0;border-bottom:1px solid #eee5d5"><strong>Telefone</strong></td><td style="padding:9px 0;border-bottom:1px solid #eee5d5">${escapeHtml(phone)}</td></tr><tr><td style="padding:9px 0;border-bottom:1px solid #eee5d5"><strong>E-mail</strong></td><td style="padding:9px 0;border-bottom:1px solid #eee5d5">${escapeHtml(email)}</td></tr></table><div style="margin-top:20px;padding:16px;border-left:4px solid #a88b36;border-radius:8px;background:#faf4e7;white-space:pre-wrap">${escapeHtml(suggestion)}</div></div></div></body></html>`;
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      sender: { email: senderEmail, name: senderName },
      to: recipients.map(recipient => ({ email: recipient })),
      replyTo: { email, name },
      subject: `Nova sugestão para a plataforma — ${name}`,
      htmlContent,
      tags: ['platform-suggestion']
    })
  });
  if (!response.ok) throw new Error(`Brevo request failed (${response.status})`);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { success:false, message:'Método não permitido.' });
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  if (cleanText(body.website, 120)) return json(res, 200, { success:true, message:'Sugestão recebida.' });

  try {
    await requireAdmin(body.sessionToken);
  } catch (error) {
    const message = String(error?.message || 'Não autorizado.');
    return json(res, message.includes('sessão administrativa expirou') ? 401 : 500, { success:false, message });
  }

  const name = cleanText(body.name, 120);
  const phone = cleanText(body.phone, 40);
  const email = cleanText(body.email, 160).toLowerCase();
  const suggestion = cleanText(body.suggestion, 4000);
  if (!name || !phone || !email || !suggestion) return json(res, 400, { success:false, message:'Preencha Nome, Telefone, E-mail e Sugestão.' });
  if (!EMAIL_PATTERN.test(email)) return json(res, 400, { success:false, message:'Informe um e-mail válido.' });

  try {
    await sendSuggestionEmail({ name, phone, email, suggestion });
    return json(res, 200, { success:true, message:'Sugestão enviada com sucesso.' });
  } catch (error) {
    console.error('Suggestion email error:', error?.message || 'unknown error');
    return json(res, 502, { success:false, message:'Não foi possível enviar a sugestão agora. Tente novamente em alguns minutos.' });
  }
}
