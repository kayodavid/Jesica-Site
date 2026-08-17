const SUPABASE_URL = 'https://mcsilxhgwbxtvydytjcx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_PKWZS9Za2vfbGCvKNcquow_zuymCA72';
const RECOVERY_BASE_URL = 'https://jessicamelonutri.com.br/redefinir-senha';

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json');
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
  if (!response.ok) throw new Error(typeof value === 'string' ? value : (value.message || 'Supabase RPC error'));
  return value;
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

async function sendBrevoEmail(email, token) {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL || 'contato@jessicamelonutri.com.br';
  const senderName = process.env.BREVO_SENDER_NAME || 'Jessica Melo Nutricionista';
  if (!apiKey) throw new Error('BREVO_API_KEY not configured');

  const resetUrl = `${RECOVERY_BASE_URL}?token=${encodeURIComponent(token)}`;
  const htmlContent = `<!doctype html><html lang="pt-BR"><body style="font-family:Arial,sans-serif;color:#3d3226;line-height:1.6"><div style="max-width:560px;margin:0 auto;padding:32px"><h2 style="color:#a88b36">Recuperação de acesso</h2><p>Recebemos uma solicitação para redefinir a senha do seu Portal de Acompanhamento.</p><p>O link abaixo é válido por <strong>30 minutos</strong> e pode ser usado uma única vez:</p><p><a href="${resetUrl}" style="display:inline-block;background:#a88b36;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">Redefinir minha senha</a></p><p>Se você não solicitou essa alteração, ignore este e-mail.</p><p>Atenciosamente,<br>Jessica Melo Nutricionista</p></div></body></html>`;
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      sender: { email: senderEmail, name: senderName },
      to: [{ email }],
      subject: 'Recuperação de senha — Portal Jessica Melo',
      htmlContent
    })
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Brevo ${response.status}: ${detail}`);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { success: false, message: 'Método não permitido.' });
  const { action, email, token, password } = req.body || {};

  try {
    if (action === 'request') {
      const normalizedEmail = String(email || '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        return json(res, 400, { success: false, message: 'Informe um e-mail válido.' });
      }
      const rawToken = randomToken();
      await callRpc('app_create_password_reset', { p_email: normalizedEmail, p_token: rawToken });
      // Mantém uma resposta genérica para não revelar se o e-mail está cadastrado.
      try { await sendBrevoEmail(normalizedEmail, rawToken); } catch (error) {
        console.error('Brevo recovery email error:', error.message);
        return json(res, 502, { success: false, message: 'Não foi possível enviar o e-mail agora. Tente novamente em alguns minutos.' });
      }
      return json(res, 200, { success: true, message: 'Se o e-mail estiver cadastrado, enviaremos um link de recuperação.' });
    }

    if (action === 'reset') {
      const rawToken = String(token || '');
      const newPassword = String(password || '');
      if (!rawToken || newPassword.length < 8) return json(res, 400, { success: false, message: 'O token é inválido ou a senha tem menos de 8 caracteres.' });
      const ok = await callRpc('app_consume_password_reset', { p_token: rawToken, p_password: newPassword });
      if (ok !== true) return json(res, 400, { success: false, message: 'Este link expirou ou já foi utilizado.' });
      return json(res, 200, { success: true, message: 'Senha redefinida com sucesso.' });
    }

    return json(res, 400, { success: false, message: 'Ação de recuperação inválida.' });
  } catch (error) {
    console.error('Password recovery error:', error.message);
    return json(res, 500, { success: false, message: 'Não foi possível processar a recuperação agora.' });
  }
}
