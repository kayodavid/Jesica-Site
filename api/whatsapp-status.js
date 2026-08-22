import { getMetaReadiness, publicReadiness } from './whatsapp/meta-readiness.js';

const SUPABASE_URL = 'https://mcsilxhgwbxtvydytjcx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_PKWZS9Za2vfbGCvKNcquow_zuymCA72';

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
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
  try { value = text ? JSON.parse(text) : null; } catch {}
  if (!response.ok) throw new Error(typeof value === 'string' ? value : (value?.message || `Supabase RPC ${response.status}`));
  return value;
}

async function requireAdmin(sessionToken) {
  if (!String(sessionToken || '').trim()) throw new Error('Sua sessão administrativa expirou. Entre novamente.');
  const current = await callRpc('app_current_user', { p_token: sessionToken });
  const user = Array.isArray(current) ? current[0] : current;
  if (!user || String(user.role || '').toLowerCase() !== 'admin') throw new Error('Sua sessão administrativa expirou. Entre novamente.');
  return user;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { success:false, message:'Método não permitido.' });
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  try {
    await requireAdmin(body.sessionToken);
  } catch (error) {
    const message = String(error?.message || 'Não autorizado.');
    const status = message.includes('sessão administrativa expirou') ? 401 : 500;
    return json(res, status, { success:false, message });
  }

  try {
    const readiness = await getMetaReadiness();
    return json(res, 200, { success:true, ...publicReadiness(readiness) });
  } catch (error) {
    console.error('WhatsApp status check failed', error);
    return json(res, 200, { success:true, ready:false, reason:'Não foi possível validar a integração oficial do WhatsApp.' });
  }
}
