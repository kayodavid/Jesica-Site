import { getMetaReadiness } from './meta-readiness.js';

const META_API_VERSION = process.env.WHATSAPP_GRAPH_API_VERSION || 'v26.0';
const MAX_MESSAGES_PER_RUN = 100;

function json(status, payload) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, body: JSON.stringify(payload) };
}

function isAuthorized(req) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const authorization = req.headers?.authorization || req.headers?.Authorization || '';
  return authorization === `Bearer ${expected}`;
}

function dateOnly(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function localParts(timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone || 'America/Sao_Paulo', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23' }).formatToParts(new Date());
  const pick = type => parts.find(part => part.type === type)?.value || '';
  return { date:`${pick('year')}-${pick('month')}-${pick('day')}`, time:`${pick('hour')}:${pick('minute')}` };
}

function addDays(date, days) {
  const result = new Date(`${date}T12:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + Number(days || 0));
  return dateOnly(result);
}

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

async function supabase(path, options = {}) {
  const base = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error('As credenciais seguras do Supabase não foram configuradas.');
  const response = await fetch(`${base}/rest/v1/${path}`, {
    ...options,
    headers: { apikey:key, Authorization:`Bearer ${key}`, 'Content-Type':'application/json', ...(options.headers || {}) }
  });
  const body = await response.text();
  if (!response.ok) throw new Error(body || `Supabase respondeu ${response.status}.`);
  return body ? JSON.parse(body) : null;
}

async function logMessage(data) {
  const rows = await supabase('whatsapp_message_log', { method:'POST', headers:{ Prefer:'return=representation' }, body:JSON.stringify(data) });
  return Array.isArray(rows) ? rows[0] : rows;
}

async function updateLog(id, data) {
  await supabase(`whatsapp_message_log?id=eq.${encodeURIComponent(id)}`, { method:'PATCH', headers:{ Prefer:'return=minimal' }, body:JSON.stringify({ ...data, updated_at:new Date().toISOString() }) });
}

async function sendTemplate({ to, templateName, language, patientName, serviceName, dueDate }) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) throw new Error('As credenciais seguras da API do WhatsApp ainda não foram configuradas.');
  const response = await fetch(`https://graph.facebook.com/${META_API_VERSION}/${phoneNumberId}/messages`, {
    method:'POST',
    headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },
    body:JSON.stringify({
      messaging_product:'whatsapp',
      to,
      type:'template',
      template:{
        name:templateName,
        language:{ code:language || 'pt_BR' },
        components:[{ type:'body', parameters:[
          { type:'text', text:patientName || 'Paciente' },
          { type:'text', text:serviceName || 'acompanhamento nutricional' },
          { type:'text', text:new Intl.DateTimeFormat('pt-BR', { timeZone:'UTC' }).format(new Date(`${dueDate}T12:00:00Z`)) }
        ] }]
      }
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || `WhatsApp respondeu ${response.status}.`);
  return payload?.messages?.[0]?.id || '';
}

export default async function handler(req, res) {
  const response = await dispatch(req);
  if (res) { res.status(response.statusCode).set(response.headers).send(response.body); return; }
  return response;
}

export async function dispatch(req) {
  if (req.method && req.method !== 'GET' && req.method !== 'POST') return json(405, { success:false, message:'Método não permitido.' });
  if (!isAuthorized(req)) return json(401, { success:false, message:'Não autorizado.' });
  try {
    const settingsRows = await supabase('whatsapp_automation_settings?id=eq.true&select=*');
    const settings = settingsRows?.[0];
    const metaReadiness = await getMetaReadiness();
    if (!settings?.enabled || !settings?.provider_ready || !metaReadiness.ready) return json(200, { success:true, sent:0, skipped:0, message:'Automação desativada ou a integração oficial da Meta ainda não foi validada.' });
    const [rules, contacts, snapshots] = await Promise.all([
      supabase('whatsapp_automation_rules?active=eq.true&template_name=not.is.null&select=*'),
      supabase('whatsapp_patient_contacts?consent_status=eq.granted&automations_enabled=eq.true&select=*'),
      supabase('whatsapp_service_snapshots?service_status=eq.active&select=*')
    ]);
    const now = localParts(settings.dispatch_timezone);
    const today = now.date;
    const contactByPatient = new Map((contacts || []).map(contact => [contact.patient_key, contact]));
    const eligible = [];
    for (const snapshot of snapshots || []) {
      const contact = contactByPatient.get(snapshot.patient_key);
      if (!contact || !normalizePhone(contact.phone_e164)) continue;
      const endDate = addDays(snapshot.start_date, snapshot.duration_days);
      for (const rule of rules || []) {
        if (rule.service_id && rule.service_id !== snapshot.service_id) continue;
        const triggerDate = addDays(endDate, -Number(rule.offset_days || 0));
        if (triggerDate !== today) continue;
        if (String(rule.send_time || '09:00').slice(0,5) !== now.time) continue;
        eligible.push({ rule, snapshot, contact, endDate });
      }
    }
    const selected = eligible.slice(0, MAX_MESSAGES_PER_RUN);
    let sent = 0, skipped = 0, failed = 0;
    const details = [];
    for (const item of selected) {
      let entry;
      try {
        entry = await logMessage({
          rule_id:item.rule.id,
          service_snapshot_id:item.snapshot.source_link_id,
          patient_key:item.snapshot.patient_key,
          patient_name:item.snapshot.patient_name || item.contact.patient_name || '',
          recipient_phone:normalizePhone(item.contact.phone_e164),
          scheduled_for:today,
          template_name:item.rule.template_name,
          status:'sending',
          metadata:{ trigger_type:item.rule.trigger_type, end_date:item.endDate, offset_days:item.rule.offset_days }
        });
      } catch (error) {
        if (String(error.message || '').includes('duplicate key')) { skipped += 1; details.push({ patient:item.snapshot.patient_name, status:'skipped', reason:'já registrado' }); continue; }
        throw error;
      }
      try {
        const messageId = await sendTemplate({ to:normalizePhone(item.contact.phone_e164), templateName:item.rule.template_name, language:item.rule.template_language, patientName:item.snapshot.patient_name || item.contact.patient_name, serviceName:item.snapshot.service_name, dueDate:item.endDate });
        await updateLog(entry.id, { status:'sent', whatsapp_message_id:messageId, error_message:null });
        sent += 1; details.push({ patient:item.snapshot.patient_name, status:'sent' });
      } catch (error) {
        await updateLog(entry.id, { status:'failed', error_message:String(error.message || 'Falha no envio.') });
        failed += 1; details.push({ patient:item.snapshot.patient_name, status:'failed', reason:String(error.message || '') });
      }
    }
    return json(200, { success:true, date:today, time:now.time, eligible:eligible.length, sent, failed, skipped, limited:eligible.length > MAX_MESSAGES_PER_RUN, details });
  } catch (error) {
    console.error('WhatsApp dispatch failed', error);
    return json(500, { success:false, message:String(error.message || 'Falha no processamento programado.') });
  }
}
