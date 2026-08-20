import crypto from 'node:crypto';

export const config = { api: { bodyParser: false } };

function respond(res, status, payload, headers = {}) {
  res.status(status);
  Object.entries(headers).forEach(([name, value]) => res.setHeader(name, value));
  if (typeof payload === 'string') return res.send(payload);
  return res.json(payload);
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const parts = [];
    req.on('data', chunk => parts.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(parts)));
    req.on('error', reject);
  });
}

function validSignature(rawBody, signature) {
  const secret = process.env.META_APP_SECRET;
  if (!secret) return false;
  const expected = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  const received = String(signature || '');
  if (received.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

async function supabase(path, options = {}) {
  const base = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error('Credenciais seguras do Supabase não configuradas.');
  const response = await fetch(`${base}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  if (!response.ok) throw new Error(await response.text());
  return response;
}

function extractStatuses(payload) {
  const result = [];
  (payload?.entry || []).forEach(entry => {
    (entry?.changes || []).forEach(change => {
      (change?.value?.statuses || []).forEach(status => {
        if (status?.id && status?.status) result.push({
          id: String(status.id),
          status: String(status.status),
          recipient: String(status.recipient_id || ''),
          timestamp: Number(status.timestamp || 0),
          errors: status.errors || []
        });
      });
    });
  });
  return result;
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const mode = req.query?.['hub.mode'];
    const verifyToken = req.query?.['hub.verify_token'];
    const challenge = req.query?.['hub.challenge'];
    if (mode === 'subscribe' && verifyToken && verifyToken === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
      return respond(res, 200, String(challenge || ''), { 'Content-Type': 'text/plain; charset=utf-8' });
    }
    return respond(res, 403, { success: false, message: 'Token de verificação inválido.' });
  }

  if (req.method !== 'POST') return respond(res, 405, { success: false, message: 'Método não permitido.' }, { Allow: 'GET, POST' });

  try {
    const rawBody = await readRawBody(req);
    if (!validSignature(rawBody, req.headers['x-hub-signature-256'])) {
      return respond(res, 403, { success: false, message: 'Assinatura do webhook inválida.' });
    }

    const payload = JSON.parse(rawBody.toString('utf8') || '{}');
    const statuses = extractStatuses(payload);
    await Promise.all(statuses.map(async item => {
      const failed = item.status === 'failed';
      const errorMessage = failed ? (item.errors?.[0]?.title || item.errors?.[0]?.message || 'Falha reportada pelo WhatsApp.') : null;
      await supabase(`whatsapp_message_log?whatsapp_message_id=eq.${encodeURIComponent(item.id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ status: item.status, error_message: errorMessage, updated_at: new Date().toISOString() })
      });
    }));

    return respond(res, 200, { success: true, received: statuses.length });
  } catch (error) {
    console.error('WhatsApp webhook error', error);
    return respond(res, 500, { success: false, message: 'Não foi possível processar o webhook.' });
  }
}
