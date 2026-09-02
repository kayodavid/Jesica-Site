import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const SUPABASE_URL = 'https://mcsilxhgwbxtvydytjcx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_PKWZS9Za2vfbGCvKNcquow_zuymCA72';
const QUESTIONNAIRE_BASE_URL = 'https://jessicamelonutri.com.br/responder-questionario';
const QUIZ_DELIMITER = '\n---QUIZ---\n';
const QUESTION_DELIMITER = '\n---QUESTION---\n';
const QUESTION_THEME = '__patient_question__';
const EMAIL_QUIZ_INVITATION_THEME = '__email_quiz_invitation__';
const EMAIL_QUIZ_RESPONSE_THEME = '__email_quiz_response__';
const EMAIL_QUIZ_PROGRESS_THEME = '__email_quiz_progress__';
const EMAIL_QUIZ_CLICK_THEME = '__email_quiz_click__';
const EMAIL_QUIZ_SCHEDULE_THEME = '__email_quiz_schedule__';
const EMAIL_TEMPLATE_THEME = '__email_quiz_template__';
const EMAIL_TEMPLATE_SOURCE = 'email-quiz-template://default';
const PLATFORM_PREFERENCES_THEME = '__platform_preferences__';
const PLATFORM_PREFERENCES_SOURCE = 'platform-preferences://default';
const EMOJI_SCALE_DISPLAY_MODES = new Set(['emoji-only', 'emoji-text', 'text-only']);
const PATIENT_PROFILE_THEME = '__patient_profile__';
const PATIENT_QUIZ_LINK_THEME = '__patient_quiz_link__';
const PATIENT_SERVICE_LINK_THEME = '__patient_service_link__';
const EMAIL_SEND_MODES = new Set(['unique', 'daily', 'weekly', 'manual', 'open']);
const EMAIL_SEND_MODE_LABELS = { unique:'Envio Único', daily:'Envio Diário', weekly:'Envio Semanal', manual:'Envio Manual', open:'Envio Aberto' };
// Marco da nova base do relatório: registros anteriores permanecem preservados,
// mas não entram nos totais de envios de e-mail a partir desta publicação.
const EMAIL_REPORT_COUNTING_START_AT = '2026-08-27T14:52:35.000Z';
// Marco da nova base do relatório de respostas: o histórico permanece preservado,
// mas convites anteriores não entram nos indicadores desta nova fase.
const RESPONSE_REPORT_COUNTING_START_AT = '2026-08-27T15:55:18.000Z';

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  return res.end(JSON.stringify(body));
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

const SITE_DEFAULT_LOGO_URL = 'https://jessicamelonutri.com.br/assets/images/logo_sem_fundo.png';

function defaultEmailTemplate() {
  return { version:1, id:'default', layout:'classic', logoUrl:SITE_DEFAULT_LOGO_URL, logoDataUrl:'', brandName:'Jessica Melo Nutricionista', showBrandName:true, preheader:'Novo questionário disponível', title:'Novo questionário disponível', greeting:'Olá, {primeiro_nome}!', intro:'A Dra. Jessica preparou o questionário {questionario} para acompanhar o seu cuidado nutricional.', body:'Reserve alguns minutos para responder. Suas respostas serão enviadas de forma segura para o acompanhamento profissional.', buttonText:'Responder questionário', deadlineText:'Este convite é individual e fica disponível até {prazo}.', footerText:'© {ano} Jessica Melo Nutricionista. Todos os direitos reservados.', subject:'Questionário disponível — {questionario}', primaryColor:'#a88b36', backgroundColor:'#faf8f3', textColor:'#3d3226' };
}

function normalizeEmailTemplate(value) {
  const fallback = defaultEmailTemplate(); const data = value && typeof value === 'object' ? value : {}; const layouts = new Set(['classic','modern','editorial','soft','midnight','botanical','terracotta','minimal']);
  const color = (candidate, fallbackColor) => /^#[0-9a-f]{6}$/i.test(String(candidate || '')) ? String(candidate).toLowerCase() : fallbackColor;
  const logoDataUrl = /^data:image\/(?:png|jpe?g|webp|gif|svg\+xml);base64,[a-z0-9+/=\s]+$/i.test(String(data.logoDataUrl || '')) && String(data.logoDataUrl).length <= 700000 ? String(data.logoDataUrl) : '';
  const logoUrl = String(data.logoUrl || '').trim().slice(0, 1000);
  return { ...fallback, ...data, version:1, id:'default', layout:layouts.has(data.layout) ? data.layout : fallback.layout, logoUrl, logoDataUrl, brandName:String(data.brandName || fallback.brandName).trim().slice(0,100), showBrandName:data.showBrandName !== false, preheader:String(data.preheader || fallback.preheader).trim().slice(0,180), title:String(data.title || fallback.title).trim().slice(0,160), greeting:String(data.greeting || fallback.greeting).trim().slice(0,180), intro:String(data.intro || fallback.intro).trim().slice(0,500), body:String(data.body || fallback.body).trim().slice(0,700), buttonText:String(data.buttonText || fallback.buttonText).trim().slice(0,80), deadlineText:String(data.deadlineText || fallback.deadlineText).trim().slice(0,260), footerText:String(data.footerText || fallback.footerText).trim().slice(0,260), subject:String(data.subject || fallback.subject).trim().slice(0,180), primaryColor:color(data.primaryColor, fallback.primaryColor), backgroundColor:color(data.backgroundColor, fallback.backgroundColor), textColor:color(data.textColor, fallback.textColor), updatedAt:String(data.updatedAt || '') };
}

function emailAssetUrl(value) {
  const raw = String(value || '').trim();
  if (!raw || raw.startsWith('data:')) return SITE_DEFAULT_LOGO_URL;
  try {
    const parsed = new URL(raw, 'https://jessicamelonutri.com.br');
    if (!['http:', 'https:'].includes(parsed.protocol)) return SITE_DEFAULT_LOGO_URL;
    return parsed.href;
  } catch {
    return SITE_DEFAULT_LOGO_URL;
  }
}

function replaceEmailTokens(value, values) { return String(value || '').replace(/\{primeiro_nome\}/g, values.firstName).replace(/\{questionario\}/g, values.quizTitle).replace(/\{prazo\}/g, values.deadline).replace(/\{ano\}/g, values.year); }
function replaceReminderTokens(value, values) { return String(value || '').replace(/\{primeiro_nome\}/g, values.firstName).replace(/\{paciente\}/g, values.patient).replace(/\{questionario\}/g, values.quizTitle).replace(/\{prazo\}/g, values.deadline).replace(/\{dias_restantes\}/g, values.daysRemaining).replace(/\{link_questionario\}/g, values.questionnaireUrl).replace(/\{nutricionista\}/g, values.nutritionist); }

async function getEmailTemplate(sessionToken) {
  try { const records = await listStoredQuestionnaireRecords(sessionToken); const record = records.find(item => item?.theme === EMAIL_TEMPLATE_THEME || recordSource(item) === EMAIL_TEMPLATE_SOURCE); if (!record) return defaultEmailTemplate(); let data = {}; try { data = JSON.parse(record.description || '{}'); } catch {} return normalizeEmailTemplate(data); } catch (error) { console.error('Email template load error:', error.message); return defaultEmailTemplate(); }
}

async function getPlatformPreferences(sessionToken) {
  try { const records = await listStoredQuestionnaireRecords(sessionToken); const record = records.find(item => item?.theme === PLATFORM_PREFERENCES_THEME || recordSource(item) === PLATFORM_PREFERENCES_SOURCE); if (!record) return {}; let data = {}; try { data = JSON.parse(record.description || '{}'); } catch {} return data; } catch { return {}; }
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
  const current = await callRpc('app_current_user', { p_token: sessionToken });
  const user = Array.isArray(current) ? current[0] : current;
  if (!user || String(user.role || '').toLowerCase() !== 'admin') throw new Error('Sua sessão administrativa expirou. Entre novamente para enviar questionários.');
  return user;
}

function normalizeQuiz(record) {
  const rawDescription = String(record?.description || '');
  const [description, packed] = rawDescription.split(QUIZ_DELIMITER);
  let data = {};
  try { data = JSON.parse(packed || '{}'); } catch {}
  return {
    id: String(record?.id || ''),
    title: String(record?.title || 'Questionário'),
    description: String(description || ''),
    questionIds: Array.isArray(data.questionIds) ? data.questionIds : [],
    questionSettings: data.questionSettings && typeof data.questionSettings === 'object' ? data.questionSettings : {},
    questionSnapshots: Array.isArray(data.questionSnapshots) ? data.questionSnapshots : [],
    contextBlocks: Array.isArray(data.contextBlocks) ? data.contextBlocks : [],
    coverText: String(data.coverText || ''),
    coverImage: String(data.coverImage || record?.thumbnailUrl || record?.thumbnail_url || ''),
    scoreVisible: data.scoreVisible !== false,
    active: data.active !== false
  };
}

function usableText(value) {
  const text = String(value ?? '').trim();
  return text && !/^(undefined|null)$/i.test(text) ? text : '';
}

const PUBLIC_QUESTIONNAIRE_ERROR = 'Houve um erro ao enviar o questionário. Tente novamente e, caso o problema se repita, entre em contato com o suporte.';
const TECHNICAL_EMAIL_ERROR = /brevo|smtp|provedor|provider|message[_ -]?id|margem de segurança|supabase|api[_ -]?key|http\s*\d{3}|não retornou o message/i;
function publicQuestionnaireError(value, fallback = PUBLIC_QUESTIONNAIRE_ERROR) {
  const message = usableText(value);
  return !message || TECHNICAL_EMAIL_ERROR.test(message) ? fallback : message;
}

function isQuestionRecord(record) {
  const source = String(record?.embedUrl || record?.embed_url || '');
  return /^question:\/\/[a-z0-9_-]+$/i.test(source) || record?.theme === QUESTION_THEME;
}

function normalizeQuestion(record) {
  const rawDescription = String(record?.description || '');
  const [questionText, packed] = rawDescription.split(QUESTION_DELIMITER);
  let data = {};
  try { data = JSON.parse(packed || '{}'); } catch {}
  return {
    id: String(record?.id || ''),
    title: usableText(record?.title) || 'Pergunta',
    questionText: usableText(questionText),
    questionHtml: usableText(data.questionHtml),
    questionImage: usableText(data.questionImage),
    code: usableText(data.code || record?.code),
    label: usableText(data.label || record?.label),
    type: usableText(data.type || record?.type) || 'single',
    icon: usableText(data.icon || record?.icon) || '○',
    options: Array.isArray(data.options) ? data.options.filter(Boolean) : [],
    optionSettings: Array.isArray(data.optionSettings) ? data.optionSettings : [],
    scaleConfig: data.scaleConfig && typeof data.scaleConfig === 'object' ? data.scaleConfig : null,
    metricUnit: usableText(data.metricUnit),
    openResponseTitle: usableText(data.openResponseTitle),
    numericOnly: data.numericOnly === true || data.type === 'metric',
    required: data.required !== false,
    versionAt: record?.updatedAt || record?.updated_at || record?.createdAt || record?.created_at || ''
  };
}

function hydrateQuestionSnapshot(snapshot, sourceQuestion) {
  const saved = snapshot && typeof snapshot === 'object' ? snapshot : {};
  const current = sourceQuestion && typeof sourceQuestion === 'object' ? sourceQuestion : {};
  return {
    ...current,
    ...saved,
    id: usableText(saved.id) || usableText(current.id),
    title: usableText(saved.title) || usableText(current.title) || 'Pergunta',
    questionText: usableText(saved.questionText) || usableText(current.questionText),
    questionHtml: usableText(saved.questionHtml) || usableText(current.questionHtml),
    questionImage: usableText(saved.questionImage) || usableText(current.questionImage),
    code: usableText(saved.code) || usableText(current.code),
    label: usableText(saved.label) || usableText(current.label),
    type: usableText(saved.type) || usableText(current.type) || 'single',
    icon: usableText(saved.icon) || usableText(current.icon) || '○',
    options: Array.isArray(saved.options) && saved.options.length ? saved.options : (Array.isArray(current.options) ? current.options : []),
    optionSettings: Array.isArray(saved.optionSettings) && saved.optionSettings.length ? saved.optionSettings : (Array.isArray(current.optionSettings) ? current.optionSettings : []),
    scaleConfig: saved.scaleConfig && typeof saved.scaleConfig === 'object' ? saved.scaleConfig : current.scaleConfig,
    metricUnit: usableText(saved.metricUnit) || usableText(current.metricUnit),
    openResponseTitle: usableText(saved.openResponseTitle) || usableText(current.openResponseTitle),
    numericOnly: saved.numericOnly === true || current.numericOnly === true,
    required: saved.required !== false && current.required !== false
  };
}

async function loadQuiz(sessionToken, quizId) {
  const listed = await callRpc('app_list_videos', { p_token: sessionToken });
  const records = Array.isArray(listed) ? listed : [];
  const rawQuiz = records.find(item => String(item?.id || '') === String(quizId || ''));
  const quiz = normalizeQuiz(rawQuiz);
  const questionsById = new Map(records.filter(isQuestionRecord).map(record => {
    const question = normalizeQuestion(record);
    return [question.id, question];
  }));
  quiz.questionSnapshots = quiz.questionSnapshots.map(snapshot => hydrateQuestionSnapshot(snapshot, questionsById.get(String(snapshot?.id || ''))));
  if (!quiz.id || !quiz.active || !quiz.questionSnapshots.length) throw new Error('Este questionário não está disponível para envio.');
  return quiz;
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString('base64url');
}

function base64UrlDecode(value) {
  return Buffer.from(String(value || ''), 'base64url');
}

function signingKey() {
  const secret = String(process.env.EMAIL_QUIZ_SIGNING_SECRET || process.env.BREVO_API_KEY || '');
  if (secret.length < 32) throw new Error('A chave segura de convites por e-mail ainda não foi configurada.');
  return createHash('sha256').update(secret).digest();
}

function encryptInvitation(payload) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', signingKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [base64UrlEncode(iv), base64UrlEncode(tag), base64UrlEncode(encrypted)].join('.');
}

function decryptInvitation(token) {
  const [ivPart, tagPart, contentPart] = String(token || '').split('.');
  if (!ivPart || !tagPart || !contentPart) throw new Error('Convite inválido.');
  try {
    const decipher = createDecipheriv('aes-256-gcm', signingKey(), base64UrlDecode(ivPart));
    decipher.setAuthTag(base64UrlDecode(tagPart));
    const plain = Buffer.concat([decipher.update(base64UrlDecode(contentPart)), decipher.final()]).toString('utf8');
    const invitation = JSON.parse(plain);
    if (!invitation?.quizId || !invitation?.sessionToken || !invitation?.expiresAt || Number(invitation.expiresAt) < Date.now()) throw new Error('Convite expirado.');
    return invitation;
  } catch (error) {
    if (error.message === 'Convite expirado.') throw error;
    throw new Error('Convite inválido ou expirado.');
  }
}

function cleanAnswer(value) {
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
  return text.slice(0, 12_000);
}

async function sendBrevoEmail({ to, subject, htmlContent, replyTo, scheduledAt, tags = [] }) {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL || 'contato@jessicamelonutri.com.br';
  const senderName = process.env.BREVO_SENDER_NAME || 'Jessica Melo Nutricionista';
  if (!apiKey) throw new Error('O serviço de e-mail ainda não foi configurado.');
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      sender: { email: senderEmail, name: senderName },
      to: [{ email: to.email, name: to.name || undefined }],
      ...(replyTo ? { replyTo } : {}),
      subject,
      htmlContent,
      ...(scheduledAt ? { scheduledAt } : {}),
      ...(Array.isArray(tags) && tags.length ? { tags } : {})
    })
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch {}
  if (!response.ok) throw new Error(`Brevo ${response.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  return data || {};
}

async function cancelBrevoEmail(identifier) {
  const apiKey = process.env.BREVO_API_KEY;
  const value = String(identifier || '').trim();
  if (!apiKey) throw new Error('O serviço de e-mail ainda não foi configurado.');
  if (!value) return true;
  const response = await fetch(`https://api.brevo.com/v3/smtp/email/${encodeURIComponent(value)}`, {
    method: 'DELETE',
    headers: { 'api-key': apiKey, Accept: 'application/json' }
  });
  if (response.status === 404) return true;
  if (!response.ok) throw new Error('Não foi possível cancelar o agendamento na Brevo.');
  return true;
}

function validDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function brevoEventTimestamp(item) {
  const epoch = Number(item?.ts_epoch);
  if (Number.isFinite(epoch) && epoch > 0) return epoch < 1_000_000_000_000 ? epoch * 1000 : epoch;
  const eventEpoch = Number(item?.ts_event);
  if (Number.isFinite(eventEpoch) && eventEpoch > 0) return eventEpoch < 1_000_000_000_000 ? eventEpoch * 1000 : eventEpoch;
  const seconds = Number(item?.ts);
  if (Number.isFinite(seconds) && seconds > 0) return seconds < 1_000_000_000_000 ? seconds * 1000 : seconds;
  const parsed = Date.parse(String(item?.date || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeBrevoQuestionnaireEvents(events, invitations = []) {
  const storedInvitations = (Array.isArray(invitations) ? invitations : []).map(invitation => ({ ...invitation, email:String(invitation.recipientEmail || '').trim().toLowerCase(), timestamp:Date.parse(invitation.sentAt || '') })).filter(invitation => invitation.email && Number.isFinite(invitation.timestamp));
  const storedMessageIds = new Set(storedInvitations.map(invitation => String(invitation.providerMessageId || '').trim()).filter(Boolean));
  const tagsOf = item => { const source = item?.tags ?? item?.tag ?? []; return Array.isArray(source) ? source.map(value => String(value || '').toLowerCase()) : String(source || '').split(/[,;|]/).map(value => value.trim().toLowerCase()).filter(Boolean); };
  const isStoredInvitationEvent = item => { const messageId = String(item?.['message-id'] || item?.messageId || item?.message_id || '').trim(); return messageId && storedMessageIds.has(messageId); };
  const grouped = new Map();
  (Array.isArray(events) ? events : []).forEach(item => {
    const subject = String(item?.subject || '');
    const tagged = tagsOf(item).some(tag => /questionnaire|questionario|quiz/.test(tag));
    if (!/^Questionário disponível\s*[—-]/i.test(subject) && !tagged && !isStoredInvitationEvent(item)) return;
    const email = String(item?.email || '').trim().toLowerCase();
    const messageId = String(item?.['message-id'] || item?.messageId || item?.message_id || item?.id || '').trim();
    const occurredAt = brevoEventTimestamp(item);
    const key = messageId || `${email}|${subject}|${Math.floor(occurredAt / 60_000)}`;
    const event = String(item?.event || '').toLowerCase();
    const existing = grouped.get(key) || { id:key, messageId, email, subject, sentAt:occurredAt || null, events:[] };
    if (!existing.sentAt || (event === 'request' && occurredAt < existing.sentAt)) existing.sentAt = occurredAt || existing.sentAt;
    existing.events.push({ event, occurredAt });
    grouped.set(key, existing);
  });
  const failures = new Set(['soft_bounce','hard_bounce','invalid_email','blocked','error','spam']);
  return [...grouped.values()].map(item => {
    const names = new Set(item.events.map(event => event.event));
    const eventTime = kind => Math.max(0, ...item.events.filter(event => event.event === kind).map(event => event.occurredAt || 0));
    const failed = [...names].some(name => failures.has(name));
    const clickedAt = eventTime('click');
    const openedAt = Math.max(eventTime('unique_opened'), eventTime('opened'), eventTime('proxy_open'), eventTime('unique_proxy_open'));
    const deliveredAt = eventTime('delivered');
    const requestedAt = eventTime('request') || item.sentAt || 0;
    const messageId = String(item?.messageId || '').trim();
    return { id:item.id || '', providerMessageId:messageId, messageId, email:item.email, subject:item.subject, sentAt:requestedAt ? new Date(requestedAt).toISOString() : '', deliveredAt:deliveredAt ? new Date(deliveredAt).toISOString() : '', openedAt:openedAt ? new Date(openedAt).toISOString() : '', clickedAt:clickedAt ? new Date(clickedAt).toISOString() : '', failed, status:failed ? 'failed' : (clickedAt ? 'clicked' : (openedAt ? 'opened' : (deliveredAt ? 'delivered' : 'sent'))) };
  }).filter(item => item.sentAt).sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt));
}

async function getBrevoQuestionnaireEvents(startDate, endDate, invitations = []) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) throw new Error('O serviço de e-mail ainda não foi configurado.');
  const url = new URL('https://api.brevo.com/v3/smtp/statistics/events');
  url.searchParams.set('startDate', startDate);
  url.searchParams.set('endDate', endDate);
  url.searchParams.set('limit', '1000');
  url.searchParams.set('sort', 'desc');
  const response = await fetch(url, { headers: { 'api-key': apiKey, Accept: 'application/json' } });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch {}
  if (!response.ok) throw new Error(`Brevo ${response.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  return normalizeBrevoQuestionnaireEvents(data?.events || data?.data || [], invitations);
}

function mergeQuestionnaireEmailStates(providerEvents, invitations, clicks, responses) {
  const invitationList = Array.isArray(invitations) ? invitations : [];
  const clickByInvitation = new Map((Array.isArray(clicks) ? clicks : []).filter(item => item?.invitationId).map(item => [item.invitationId, item]));
  const responseByInvitation = new Map();
  const linkedResponses = linkResponsesToInvitations(responses, invitationList);
  linkedResponses.filter(item => item?.invitationId).forEach(item => {
    const previous = responseByInvitation.get(item.invitationId);
    if (!previous || Date.parse(item.respondedAt || '') >= Date.parse(previous.respondedAt || '')) responseByInvitation.set(item.invitationId, item);
  });
  const isCompleteResponse = response => Boolean(response?.respondedAt);
  const byMessageId = new Map(invitationList.filter(item => item.providerMessageId).map(item => [String(item.providerMessageId), item]));
  const byEmail = new Map();
  invitationList.forEach(item => { const email = String(item.recipientEmail || '').toLowerCase(); if (!email) return; const list = byEmail.get(email) || []; list.push(item); byEmail.set(email, list); });
  const matchInvitation = event => {
    const direct = byMessageId.get(String(event.providerMessageId || event.messageId || ''));
    if (direct) return direct;
    const email = String(event.email || '').toLowerCase();
    const candidates = byEmail.get(email) || [];
    const eventTime = Date.parse(event.sentAt || '') || 0;
    return candidates.map(item => ({ item, distance:Math.abs((Date.parse(item.sentAt || '') || 0) - eventTime) })).sort((a, b) => a.distance - b.distance)[0]?.item || null;
  };
  const rows = [];
  const representedInvitations = new Set();
  (Array.isArray(providerEvents) ? providerEvents : []).forEach(event => {
    const invitation = matchInvitation(event);
    const invitationId = invitation?.invitationId || '';
    const click = invitationId ? clickByInvitation.get(invitationId) : null;
    const responseRecord = invitationId ? responseByInvitation.get(invitationId) : null;
    const response = isCompleteResponse(responseRecord) ? responseRecord : null;
    if (invitationId) representedInvitations.add(invitationId);
    const clickedAt = [event.clickedAt, click?.clickedAt].filter(Boolean).sort((a, b) => Date.parse(b) - Date.parse(a))[0] || '';
    rows.push({ ...event, invitationId, patientKey:invitation?.patientKey || '',       patientName:invitation?.patientName || '', quizLinkId:invitation?.quizLinkId || '', quizId:invitation?.quizId || '', quizTitle:invitation?.quizTitle || event.subject || 'Questionário', sendMode:normalizeEmailSendMode(invitation?.sendMode) || emailSendModeFromScheduleKey(invitation?.scheduleKey), scheduleKey:invitation?.scheduleKey || '', clickedAt, respondedAt:response?.respondedAt || '', responseId:response?.id || '', responseStatus:response ? 'responded' : '' });
  });
  invitationList.forEach(invitation => {
    const click = clickByInvitation.get(invitation.invitationId);
    const responseRecord = responseByInvitation.get(invitation.invitationId);
    const response = isCompleteResponse(responseRecord) ? responseRecord : null;
    if (representedInvitations.has(invitation.invitationId) || (!click && !response)) return;
    const clickedAt = click?.clickedAt || '';
    rows.push({ id:invitation.providerMessageId || invitation.invitationId, providerMessageId:invitation.providerMessageId || '', email:invitation.recipientEmail, subject:`Questionário disponível — ${invitation.quizTitle}`, sentAt:invitation.sentAt || '', deliveredAt:'', openedAt:'', clickedAt, respondedAt:response?.respondedAt || '', responseId:response?.id || '', responseStatus:response ? 'responded' : '', patientKey:invitation.patientKey, patientName:invitation.patientName, quizLinkId:invitation.quizLinkId || '', quizId:invitation.quizId, quizTitle:invitation.quizTitle, sendMode:normalizeEmailSendMode(invitation.sendMode) || emailSendModeFromScheduleKey(invitation.scheduleKey), scheduleKey:invitation.scheduleKey || '', failed:false, status:response ? 'responded' : (clickedAt ? 'clicked' : 'sent') });
  });
  return rows.sort((a, b) => new Date(b.sentAt || 0) - new Date(a.sentAt || 0));
}

function recordSource(record) {
  return String(record?.embedUrl || record?.embed_url || record?.embedURL || record?.source || '');
}

function recordTheme(record) {
  return String(record?.theme || record?.category || record?.type || '').trim().toLowerCase();
}

function parseStoredRecord(record) {
  if (record?.description && typeof record.description === 'object') return record.description;
  try { return JSON.parse(String(record?.description || '{}')); } catch { return {}; }
}

function isPatientProfileRecord(record) {
  const source = recordSource(record).toLowerCase();
  return recordTheme(record) === PATIENT_PROFILE_THEME || /^patient-profile:\/\//i.test(source);
}

function normalizeStoredPatientProfile(record) {
  const data = parseStoredRecord(record);
  return {
    id: usableText(data.id || data.patientKey || record?.id),
    name: usableText(data.name || data.title || record?.title) || 'Paciente',
    email: usableText(data.email || data.recipientEmail || record?.email).toLowerCase()
  };
}

function normalizeEmailSendMode(value) {
  const mode = String(value || '').trim().toLowerCase();
  return EMAIL_SEND_MODES.has(mode) ? mode : '';
}

function emailSendModeFromScheduleKey(value) {
  const match = String(value || '').match(/(?:^|:)(unique|daily|weekly|manual|open)(?=:|$)/i);
  return normalizeEmailSendMode(match?.[1]);
}

function emailSendModeLabel(value) {
  return EMAIL_SEND_MODE_LABELS[normalizeEmailSendMode(value)] || EMAIL_SEND_MODE_LABELS.unique;
}

function isPatientQuizLinkRecord(record) {
  const source = recordSource(record).toLowerCase();
  return recordTheme(record) === PATIENT_QUIZ_LINK_THEME || /^patient-quiz-link:\/\//i.test(source);
}

function normalizeStoredQuizLink(record) {
  const data = parseStoredRecord(record);
  const config = data.sendConfig && typeof data.sendConfig === 'object' ? data.sendConfig : (data.send_config && typeof data.send_config === 'object' ? data.send_config : {});
  return {
    id: usableText(data.id || record?.id),
    patientKey: usableText(data.patientKey || data.patient_key),
    quizId: usableText(data.quizId || data.quiz_id),
    frequency: Number(data.frequency ?? 0),
    sendMode: normalizeEmailSendMode(data.sendMode || data.send_mode || config.sendMode || config.send_mode),
    sendConfig: config,
    scheduleKey: usableText(data.scheduleKey || data.schedule_key)
  };
}

function emailSendModeFromQuizLink(link) {
  if (!link) return '';
  const direct = normalizeEmailSendMode(link.sendMode || link.sendConfig?.sendMode || link.sendConfig?.send_mode);
  if (direct) return direct;
  if (Number(link.sendConfig?.intervalWeeks) > 0) return 'weekly';
  if (Number.isFinite(Number(link.frequency)) && Number(link.frequency) > 0 && Number(link.frequency) < 7) return 'weekly';
  return '';
}

function sameEmailContext(left, right) {
  if (!left || !right) return false;
  const same = (a, b) => { const first = String(a || '').trim().toLowerCase(); const second = String(b || '').trim().toLowerCase(); return Boolean(first && second && first === second); };
  return (same(left.quizLinkId, right.quizLinkId) && Boolean(left.quizLinkId)) || ((same(left.patientKey, right.patientKey) || same(left.recipientEmail, right.recipientEmail)) && (same(left.quizId, right.quizId) || same(left.quizTitle, right.quizTitle)));
}

function resolveEmailSendMode(event, invitations = [], quizLinks = [], schedules = []) {
  const invitation = (Array.isArray(invitations) ? invitations : []).find(item => item?.invitationId && item.invitationId === event?.invitationId);
  const direct = normalizeEmailSendMode(event?.sendMode || invitation?.sendMode);
  if (direct) return direct;
  const fromKey = emailSendModeFromScheduleKey(event?.scheduleKey || invitation?.scheduleKey);
  if (fromKey) return fromKey;
  const context = { ...invitation, ...event };
  const eventTime = Date.parse(event?.sentAt || invitation?.sentAt || '') || 0;
  const matchingSchedule = (Array.isArray(schedules) ? schedules : []).map(schedule => {
    const scheduleContext = { ...schedule, recipientEmail:schedule.recipientEmail, sentAt:schedule.scheduledFor };
    const sameContext = sameEmailContext(context, scheduleContext) || (String(context?.quizLinkId || '') && String(context.quizLinkId) === String(schedule?.quizLinkId || ''));
    const scheduleTime = Date.parse(schedule?.scheduledFor || '') || 0;
    return { schedule, sameContext, distance:eventTime && scheduleTime ? Math.abs(eventTime - scheduleTime) : Number.MAX_SAFE_INTEGER };
  }).filter(item => item.sameContext).sort((left, right) => left.distance - right.distance)[0];
  const scheduledMode = emailSendModeFromScheduleKey(matchingSchedule?.schedule?.scheduleKey);
  if (scheduledMode) return scheduledMode;
  const link = (Array.isArray(quizLinks) ? quizLinks : []).find(item => sameEmailContext(context, item) || (context?.quizLinkId && context.quizLinkId === item.id));
  return emailSendModeFromQuizLink(link) || 'unique';
}

function enrichEmailSendModes(events, invitations = [], records = [], schedules = []) {
  const quizLinks = (Array.isArray(records) ? records : []).filter(isPatientQuizLinkRecord).map(normalizeStoredQuizLink).filter(item => item.id || item.patientKey || item.quizId);
  return (Array.isArray(events) ? events : []).map(event => {
    const sendMode = resolveEmailSendMode(event, invitations, quizLinks, schedules);
    return { ...event, sendMode, sendModeLabel:emailSendModeLabel(sendMode) };
  });
}

async function findRegisteredPatientForTest(sessionToken, patientKey, recipientEmail) {
  const profiles = (await listStoredQuestionnaireRecords(sessionToken))
    .filter(isPatientProfileRecord)
    .map(normalizeStoredPatientProfile)
    .filter(profile => profile.id && validEmail(profile.email));
  return profiles.find(profile => profile.id === patientKey && profile.email === recipientEmail) || null;
}

function isEmailQuizInvitationRecord(record) {
  const data = parseStoredRecord(record);
  return recordTheme(record) === EMAIL_QUIZ_INVITATION_THEME.toLowerCase() || /^email-quiz-invitation:\/\/[a-z0-9_-]+$/i.test(recordSource(record)) || Boolean((data.invitationId || data.invitation_id) && (data.quizId || data.quiz_id) && (data.recipientEmail || data.recipient_email) && (data.sentAt || data.sent_at));
}

function isEmailQuizResponseRecord(record) {
  const data = parseStoredRecord(record);
  const answers = data.answers ?? data.responses ?? data.answerList;
  const submittedAt = data.respondedAt || data.responded_at || data.submittedAt || data.submitted_at || data.summary?.submittedAt || data.summary?.submitted_at;
  const hasQuestionnaireContext = data.invitationId || data.invitation_id || data.quizId || data.quiz_id || data.quizTitle || data.quiz_title || data.patientKey || data.patient_key || data.recipientEmail || data.recipient_email || data.patientName || data.patient_name;
  return recordTheme(record) === EMAIL_QUIZ_RESPONSE_THEME.toLowerCase() || /^email-quiz-response:\/\/[a-z0-9_-]+$/i.test(recordSource(record)) || Boolean(hasQuestionnaireContext && submittedAt && Array.isArray(answers));
}

function isEmailQuizProgressRecord(record) {
  const data = parseStoredRecord(record);
  return recordTheme(record) === EMAIL_QUIZ_PROGRESS_THEME.toLowerCase() || /^email-quiz-progress:\/\/[a-z0-9_-]+$/i.test(recordSource(record)) || Boolean((data.invitationId || data.invitation_id) && (data.updatedAt || data.updated_at) && (data.answeredQuestions || data.answered_questions));
}

function isEmailQuizClickRecord(record) {
  const data = parseStoredRecord(record);
  return recordTheme(record) === EMAIL_QUIZ_CLICK_THEME.toLowerCase() || /^email-quiz-click:\/\/[a-z0-9_-]+$/i.test(recordSource(record)) || Boolean((data.invitationId || data.invitation_id) && (data.clickedAt || data.clicked_at));
}

function normalizeStoredInvitation(record) {
  const data = parseStoredRecord(record);
  return {
    id: String(record?.id || ''),
    invitationId: usableText(data.invitationId || data.invitation_id),
    patientKey: usableText(data.patientKey || data.patient_key),
    patientName: usableText(data.patientName || data.patient_name) || 'Paciente',
    recipientEmail: usableText(data.recipientEmail || data.recipient_email).toLowerCase(),
    quizLinkId: usableText(data.quizLinkId || data.quiz_link_id),
    quizId: usableText(data.quizId || data.quiz_id),
    quizTitle: usableText(data.quizTitle || data.quiz_title) || 'Questionário',
    sendMode: normalizeEmailSendMode(data.sendMode || data.send_mode || data.sendConfig?.sendMode || data.send_config?.sendMode) || emailSendModeFromScheduleKey(data.scheduleKey || data.schedule_key),
    scheduleKey: usableText(data.scheduleKey || data.schedule_key),
    totalQuestions: Math.max(0, Number(data.totalQuestions ?? data.total_questions ?? 0)),
    sentAt: usableText(data.sentAt || data.sent_at) || record?.createdAt || record?.created_at || '',
    expiresAt: usableText(data.expiresAt || data.expires_at),
    providerMessageId: usableText(data.providerMessageId || data.provider_message_id),
    channel: 'email'
  };
}

function normalizeStoredResponse(record) {
  const data = parseStoredRecord(record);
  const answers = data.answers ?? data.responses ?? data.answerList;
  return {
    id: String(record?.id || ''),
    invitationId: usableText(data.invitationId || data.invitation_id),
    patientKey: usableText(data.patientKey || data.patient_key),
    patientName: usableText(data.patientName || data.patient_name) || 'Paciente',
    recipientEmail: usableText(data.recipientEmail || data.recipient_email).toLowerCase(),
    quizId: usableText(data.quizId || data.quiz_id),
    quizTitle: usableText(data.quizTitle || data.quiz_title) || 'Questionário',
    sentAt: usableText(data.sentAt || data.sent_at),
    respondedAt: usableText(data.respondedAt || data.responded_at || data.submittedAt || data.submitted_at || data.summary?.submittedAt || data.summary?.submitted_at) || record?.createdAt || record?.created_at || '',
    answers: Array.isArray(answers) ? answers : [],
    summary: data.summary && typeof data.summary === 'object' ? data.summary : {},
    totalQuestions: Math.max(0, Number(data.summary?.totalQuestions || data.totalQuestions || 0)),
    answeredQuestions: Math.max(0, Number(data.summary?.answeredQuestions || (Array.isArray(answers) ? answers.length : 0))),
    channel: 'email'
  };
}

function responseTargetScore(response, invitation) {
  if (!response || !invitation) return -1;
  const same = (left, right) => {
    const a = usableText(left).toLowerCase();
    const b = usableText(right).toLowerCase();
    return Boolean(a && b && a === b);
  };
  const samePatient = (same(response.patientKey, invitation.patientKey) || same(response.recipientEmail, invitation.recipientEmail) || same(response.patientName, invitation.patientName));
  const sameQuiz = (same(response.quizId, invitation.quizId) || same(response.quizTitle, invitation.quizTitle));
  if (!samePatient || !sameQuiz) return -1;
  const responseAt = Date.parse(response.respondedAt || response.sentAt || '');
  const invitationAt = Date.parse(invitation.sentAt || '');
  if (!Number.isFinite(responseAt) || !Number.isFinite(invitationAt)) return 0;
  if (responseAt < invitationAt - 15 * 60 * 1000) return -1;
  return Math.abs(responseAt - invitationAt);
}

function linkResponsesToInvitations(responses, invitations) {
  const invitationList = Array.isArray(invitations) ? invitations.filter(item => item?.invitationId) : [];
  const byId = new Map(invitationList.map(item => [item.invitationId, item]));
  const inferred = new Set();
  return (Array.isArray(responses) ? responses : []).map(response => {
    let invitation = byId.get(response?.invitationId || '');
    if (!invitation) {
      const candidates = invitationList
        .filter(item => !inferred.has(item.invitationId))
        .map(item => ({ item, score:responseTargetScore(response, item) }))
        .filter(candidate => candidate.score >= 0)
        .sort((left, right) => left.score - right.score || Date.parse(right.item.sentAt || 0) - Date.parse(left.item.sentAt || 0));
      invitation = candidates[0]?.item || null;
      if (invitation) inferred.add(invitation.invitationId);
    }
    if (!invitation) return response;
    return {
      ...response,
      invitationId: invitation.invitationId,
      patientKey: response.patientKey || invitation.patientKey,
      patientName: response.patientName || invitation.patientName,
      recipientEmail: response.recipientEmail || invitation.recipientEmail,
      quizId: response.quizId || invitation.quizId,
      quizTitle: response.quizTitle || invitation.quizTitle,
      sentAt: response.sentAt || invitation.sentAt
    };
  });
}

function normalizeStoredProgress(record) {
  const data = parseStoredRecord(record);
  return {
    id: String(record?.id || ''),
    invitationId: usableText(data.invitationId),
    patientKey: usableText(data.patientKey),
    patientName: usableText(data.patientName) || 'Paciente',
    recipientEmail: usableText(data.recipientEmail).toLowerCase(),
    quizId: usableText(data.quizId),
    quizTitle: usableText(data.quizTitle) || 'Questionário',
    totalQuestions: Math.max(0, Number(data.totalQuestions || 0)),
    answeredQuestions: Math.max(0, Number(data.answeredQuestions || 0)),
    updatedAt: usableText(data.updatedAt) || record?.updatedAt || record?.updated_at || record?.createdAt || record?.created_at || '',
    channel: 'email'
  };
}

function normalizeStoredClick(record) {
  const data = parseStoredRecord(record);
  return {
    id: String(record?.id || ''),
    invitationId: usableText(data.invitationId || data.invitation_id),
    patientKey: usableText(data.patientKey || data.patient_key),
    patientName: usableText(data.patientName || data.patient_name) || 'Paciente',
    recipientEmail: usableText(data.recipientEmail || data.recipient_email).toLowerCase(),
    quizId: usableText(data.quizId || data.quiz_id),
    quizTitle: usableText(data.quizTitle || data.quiz_title) || 'Questionário',
    clickedAt: usableText(data.clickedAt || data.clicked_at) || record?.createdAt || record?.created_at || '',
    channel: 'email'
  };
}

function vividEvaluationEmoji(value, fallback = '') {
  const candidate = usableText(value);
  const match = candidate.match(/[🤩😊😐😟😭😍🙂😕😣😞🙁😄☺☻☹]/u);
  const legacy = { '😍':'🤩', '🙂':'😊', '😕':'😟', '😣':'😭', '😞':'😭', '🙁':'😟', '😄':'🤩', '☺':'😊', '☻':'😊', '☹':'😟' };
  return match ? (legacy[match[0]] || match[0]) : (candidate || fallback);
}
function safeStoredAnswer(answer) {
  const value = cleanAnswer(answer?.value);
  const isImage = /^data:image\//i.test(value);
  const rawScore = Number.isFinite(Number(answer?.rawScore)) ? Number(answer.rawScore) : (Number.isFinite(Number(answer?.score)) ? Number(answer.score) : 0);
  const weight = Number.isFinite(Number(answer?.weight)) ? Number(answer.weight) : null;
  const clarificationPrompt = usableText(answer?.clarificationPrompt ?? answer?.clarification ?? answer?.followUpQuestion);
  const clarificationResponse = cleanAnswer(answer?.clarificationResponse ?? answer?.clarificationAnswer ?? answer?.followUpResponse ?? answer?.extraResponse ?? answer?.extraText ?? answer?.comment ?? answer?.note ?? answer?.observation);
  const extraResponse = cleanAnswer(answer?.extraResponse ?? answer?.extraText ?? answer?.comment ?? answer?.note ?? answer?.observation);
  return {
    questionId: usableText(answer?.questionId),
    questionCode: usableText(answer?.questionCode),
    questionTitle: usableText(answer?.questionTitle) || 'Pergunta',
    type: usableText(answer?.type) || 'single',
    label: usableText(answer?.label),
    evaluationLabel: usableText(answer?.evaluationLabel) || usableText(answer?.ratingLabel),
    evaluationEmoji: vividEvaluationEmoji(answer?.evaluationEmoji || answer?.ratingEmoji),
    score: Number.isFinite(Number(answer?.score)) ? Number(answer.score) : 0,
    rawScore,
    weight,
    scored: answer?.scored === true || Number.isFinite(Number(answer?.rawScore)),
    value: isImage ? '[Imagem enviada pelo paciente]' : value,
    clarificationPrompt,
    clarificationResponse,
    extraResponse
  };
}
function responseScoreBand(scorePercent) {
  const percent = Number(scorePercent);
  if (!Number.isFinite(percent)) return { label:'Sem avaliação', emoji:'—' };
  if (percent >= 80) return { label:'Ótimo', emoji:'🤩' };
  if (percent >= 60) return { label:'Bom', emoji:'😊' };
  if (percent >= 40) return { label:'Neutro', emoji:'😐' };
  if (percent >= 20) return { label:'Ruim', emoji:'😟' };
  return { label:'Péssimo', emoji:'😭' };
}
function questionOptionSetting(question, value) {
  const target = String(value ?? '');
  const options = Array.isArray(question?.optionSettings) ? question.optionSettings : [];
  return options.find(item => ['text','option','label','emoji','value'].some(key => String(item?.[key] ?? '') === target)) || null;
}
function enrichResponseAnswer(quiz, answer) {
  const question = (Array.isArray(quiz?.questionSnapshots) ? quiz.questionSnapshots : []).find(item => String(item?.id || '') === String(answer?.questionId || '')) || {};
  const settings = quiz?.questionSettings?.[answer?.questionId] || {};
  const scoreable = ['single','linear','emoji'].includes(String(question.type || answer?.type || ''));
  const setting = questionOptionSetting(question, answer?.value ?? answer?.label);
  const active = scoreable && settings.active !== false && !!setting;
  const rawScore = active && Number.isFinite(Number(setting?.score)) ? Number(setting.score) : 0;
  const weightValue = Number(settings.weight ?? answer?.weight ?? 1);
  const weight = Number.isFinite(weightValue) && weightValue >= 1 && weightValue <= 5 ? Math.round(weightValue) : 1;
  return {
    ...answer,
    rawScore,
    weight: active ? weight : null,
    score: active ? rawScore * weight : 0,
    scored: active,
    evaluationLabel: usableText(answer?.evaluationLabel) || usableText(setting?.text) || usableText(answer?.label),
    evaluationEmoji: vividEvaluationEmoji(answer?.evaluationEmoji || setting?.emoji, question.type === 'emoji' ? usableText(answer?.value) : '')
  };
}
function calculateResponseSummary(quiz, answers, submittedSummary = {}) {
  const questionSnapshots = Array.isArray(quiz?.questionSnapshots) ? quiz.questionSnapshots : [];
  const questionMap = new Map(questionSnapshots.map(question => [String(question?.id || ''), question]));
  const scoreRows = (Array.isArray(answers) ? answers : []).filter(answer => answer?.scored === true || (answer?.scored === undefined && ['single','linear','emoji'].includes(String(answer?.type || ''))));
  const totalScore = scoreRows.reduce((sum, answer) => sum + (Number.isFinite(Number(answer?.score)) ? Number(answer.score) : 0), 0);
  const ranges = scoreRows.map(answer => {
    const question = questionMap.get(String(answer?.questionId || '')) || {};
    const settings = quiz?.questionSettings?.[answer?.questionId] || {};
    const weightValue = Number(answer?.weight ?? settings.weight ?? 1);
    const weight = Number.isFinite(weightValue) && weightValue >= 1 && weightValue <= 5 ? weightValue : 1;
    const scores = (Array.isArray(question.optionSettings) ? question.optionSettings : []).map(item => Number(item?.score)).filter(Number.isFinite);
    const fallback = Number.isFinite(Number(answer?.rawScore)) ? Number(answer.rawScore) : 0;
    const minimum = scores.length ? Math.min(...scores) : fallback;
    const maximum = scores.length ? Math.max(...scores) : fallback;
    return { minimum:minimum * weight, maximum:maximum * weight };
  });
  const minimumScore = ranges.reduce((sum, item) => sum + item.minimum, 0);
  const maximumScore = ranges.reduce((sum, item) => sum + item.maximum, 0);
  const scorePercent = maximumScore > minimumScore ? Math.max(0, Math.min(100, ((totalScore - minimumScore) / (maximumScore - minimumScore)) * 100)) : null;
  const band = responseScoreBand(scorePercent);
  return {
    ...submittedSummary,
    totalQuestions: questionSnapshots.length || Number(submittedSummary.totalQuestions || answers?.length || 0),
    answeredQuestions: Array.isArray(answers) ? answers.length : Number(submittedSummary.answeredQuestions || 0),
    scoredQuestions: scoreRows.length,
    totalScore: Math.round(totalScore * 100) / 100,
    minimumScore: Math.round(minimumScore * 100) / 100,
    maximumScore: Math.round(maximumScore * 100) / 100,
    scorePercent: Number.isFinite(scorePercent) ? Math.round(scorePercent * 10) / 10 : null,
    scoreLabel: band.label,
    scoreEmoji: band.emoji,
    submittedAt: submittedSummary.submittedAt || new Date().toISOString()
  };
}
async function addStoredRecord(sessionToken, { title, theme, description, source }) {
  return callRpc('app_add_video', {
    p_token: sessionToken,
    p_title: title,
    p_theme: theme,
    p_description: JSON.stringify(description),
    p_url: `https://jessicamelonutri.com.br/${source}`,
    p_provider: 'youtube',
    p_embed_url: source,
    p_thumbnail_url: ''
  });
}

async function listStoredQuestionnaireRecords(sessionToken) {
  const listed = await callRpc('app_list_videos', { p_token: sessionToken });
  return Array.isArray(listed) ? listed : [];
}

async function storeInvitation(invitation, quiz) {
  const records = await listStoredQuestionnaireRecords(invitation.sessionToken);
  const source = `email-quiz-invitation://${invitation.id}`;
  const current = records.find(record => recordSource(record) === source);
  const description = {
    version: 1,
    invitationId: invitation.id,
    patientKey: invitation.patientKey,
    patientName: invitation.patientName,
    recipientEmail: invitation.recipientEmail,
    quizId: quiz.id,
    quizTitle: quiz.title,
    quizLinkId: usableText(invitation.quizLinkId),
    sendMode: normalizeEmailSendMode(invitation.sendMode) || emailSendModeFromScheduleKey(invitation.scheduleKey),
    scheduleKey: usableText(invitation.scheduleKey),
    sentAt: invitation.sentAt || new Date().toISOString(),
    expiresAt: new Date(invitation.expiresAt).toISOString(),
    providerMessageId: usableText(invitation.providerMessageId) || usableText(parseStoredRecord(current).providerMessageId),
    totalQuestions: Array.isArray(quiz.questionSnapshots) ? quiz.questionSnapshots.length : 0
  };
  if (current) {
    const currentData = parseStoredRecord(current);
    const currentDescription = JSON.stringify(currentData);
    const nextDescription = JSON.stringify(description);
    if (currentDescription === nextDescription) return;
    await callRpc('app_update_video', { p_token:invitation.sessionToken, p_id:current.id, p_title:`Envio — ${quiz.title} — ${invitation.patientName || invitation.recipientEmail}`, p_theme:EMAIL_QUIZ_INVITATION_THEME, p_description:nextDescription, p_url:`https://jessicamelonutri.com.br/${source}`, p_provider:'youtube', p_embed_url:source, p_thumbnail_url:'' });
    return;
  }
  await addStoredRecord(invitation.sessionToken, { title:`Envio — ${quiz.title} — ${invitation.patientName || invitation.recipientEmail}`, theme:EMAIL_QUIZ_INVITATION_THEME, source, description });
}

async function storeProgress(invitation, quiz, answeredQuestions) {
  const records = await listStoredQuestionnaireRecords(invitation.sessionToken);
  const source = `email-quiz-progress://${invitation.id}`;
  const totalQuestions = Array.isArray(quiz?.questionSnapshots) ? quiz.questionSnapshots.length : 0;
  const answered = Math.max(0, Math.min(Number(answeredQuestions || 0), totalQuestions));
  if (!answered || !totalQuestions) return true;
  const description = {
    version: 1,
    invitationId: invitation.id,
    patientKey: invitation.patientKey,
    patientName: invitation.patientName,
    recipientEmail: invitation.recipientEmail,
    quizId: quiz.id,
    quizTitle: quiz.title,
    totalQuestions,
    answeredQuestions: answered,
    updatedAt: new Date().toISOString()
  };
  const current = records.find(record => recordSource(record) === source);
  if (current) {
    await callRpc('app_update_video', { p_token:invitation.sessionToken, p_id:current.id, p_title:`Andamento — ${quiz.title} — ${invitation.patientName || invitation.recipientEmail}`, p_theme:EMAIL_QUIZ_PROGRESS_THEME, p_description:JSON.stringify(description), p_url:`https://jessicamelonutri.com.br/responder-questionario?token=${encodeURIComponent('progress')}`, p_provider:'youtube', p_embed_url:source, p_thumbnail_url:'' });
  } else {
    await addStoredRecord(invitation.sessionToken, { title:`Andamento — ${quiz.title} — ${invitation.patientName || invitation.recipientEmail}`, theme:EMAIL_QUIZ_PROGRESS_THEME, source, description });
  }
  return true;
}

async function storeClick(invitation) {
  if (!invitation?.id || !invitation?.sessionToken) return false;
  try {
    const records = await listStoredQuestionnaireRecords(invitation.sessionToken);
    const source = `email-quiz-click://${invitation.id}`;
    if (records.some(record => recordSource(record) === source)) return true;
    await addStoredRecord(invitation.sessionToken, {
      title: `Clique — ${invitation.patientName || invitation.recipientEmail}`,
      theme: EMAIL_QUIZ_CLICK_THEME,
      source,
      description: {
        version: 1,
        invitationId: invitation.id,
        patientKey: invitation.patientKey,
        patientName: invitation.patientName,
        recipientEmail: invitation.recipientEmail,
        quizId: invitation.quizId,
        quizTitle: invitation.quizTitle || 'Questionário',
        clickedAt: new Date().toISOString()
      }
    });
    return true;
  } catch (error) {
    console.error('Questionnaire click tracking error:', error.message);
    return false;
  }
}

async function storeResponse(invitation, quiz, answers, summary) {
  const records = await listStoredQuestionnaireRecords(invitation.sessionToken);
  const source = `email-quiz-response://${invitation.id}`;
  if (records.some(record => recordSource(record) === source)) return false;
  const respondedAt = new Date().toISOString();
  await addStoredRecord(invitation.sessionToken, {
    title: `Resposta — ${quiz.title} — ${invitation.patientName || invitation.recipientEmail}`,
    theme: EMAIL_QUIZ_RESPONSE_THEME,
    source,
    description: {
      version: 1,
      invitationId: invitation.id,
      patientKey: invitation.patientKey,
      patientName: invitation.patientName,
      recipientEmail: invitation.recipientEmail,
      quizId: quiz.id,
      quizTitle: quiz.title,
      sentAt: invitation.sentAt || '',
      respondedAt,
      answers: answers.map(safeStoredAnswer),
      summary: summary && typeof summary === 'object' ? summary : {}
    }
  });
  return true;
}

async function getStoredResponseReport(sessionToken, startDate, endDate) {
  const records = await listStoredQuestionnaireRecords(sessionToken);
  const responseCountingStartAt = Date.parse(RESPONSE_REPORT_COUNTING_START_AT);
  const isAfterResponseCountingStart = item => {
    const sentAt = Date.parse(item?.sentAt || '');
    return Number.isFinite(sentAt) && (!Number.isFinite(responseCountingStartAt) || sentAt >= responseCountingStartAt);
  };
  const allInvitations = records.filter(isEmailQuizInvitationRecord).map(normalizeStoredInvitation).filter(item => item.invitationId);
  const invitations = allInvitations.filter(isAfterResponseCountingStart);
  const linkedResponses = linkResponsesToInvitations(records.filter(isEmailQuizResponseRecord).map(normalizeStoredResponse), allInvitations);
  const newInvitationIds = new Set(invitations.map(item => item.invitationId));
  const responses = linkedResponses.filter(response => {
    if (response?.invitationId && newInvitationIds.has(response.invitationId)) return true;
    const responseAt = Date.parse(response?.respondedAt || response?.sentAt || '');
    return Number.isFinite(responseAt) && (!Number.isFinite(responseCountingStartAt) || responseAt >= responseCountingStartAt);
  });
  const progress = records.filter(isEmailQuizProgressRecord).map(normalizeStoredProgress).filter(item => item.invitationId);
  const responsesByInvitation = new Map();
  responses.forEach(item => {
    const current = responsesByInvitation.get(item.invitationId);
    if (!current || new Date(item.respondedAt || 0).getTime() >= new Date(current.respondedAt || 0).getTime()) responsesByInvitation.set(item.invitationId, item);
  });
  const progressByInvitation = new Map(progress.map(item => [item.invitationId, item]));
  const rows = invitations.map(invitation => {
    const response = responsesByInvitation.get(invitation.invitationId);
    const savedProgress = progressByInvitation.get(invitation.invitationId);
    const isExpired = invitation.expiresAt && Date.parse(invitation.expiresAt) < Date.now();
    const savedAnswered = Number(savedProgress?.answeredQuestions || 0);
    const responseAnswered = Number(response?.answeredQuestions || response?.answers?.length || 0);
    const totalQuestions = Number(invitation.totalQuestions || savedProgress?.totalQuestions || response?.totalQuestions || response?.summary?.totalQuestions || responseAnswered || 0);
    const answeredQuestions = Math.max(savedAnswered, responseAnswered);
    const hasProgress = answeredQuestions > 0;
    const isComplete = Boolean(response?.respondedAt);
    const status = isComplete ? 'responded' : (isExpired ? (hasProgress ? 'partial' : 'lost') : (hasProgress ? 'progress' : 'open'));
    return {
      id: invitation.invitationId,
      invitationId: invitation.invitationId,
      responseId: response?.id || '',
      patientKey: invitation.patientKey,
      patientName: invitation.patientName,
      recipientEmail: invitation.recipientEmail,
      quizId: invitation.quizId,
      quizTitle: invitation.quizTitle,
      sentAt: invitation.sentAt,
      respondedAt: response?.respondedAt || '',
      status,
      answers: response?.answers || [],
      summary: response?.summary || {},
      totalQuestions,
      answeredQuestions,
      channel: 'email'
    };
  });
  const known = new Set(rows.map(item => item.id));
  responses.forEach(response => {
    if (known.has(response.invitationId)) return;
    rows.push({
      id: response.invitationId,
      invitationId: response.invitationId,
      responseId: response.id || '',
      patientKey: response.patientKey,
      patientName: response.patientName,
      recipientEmail: response.recipientEmail,
      quizId: response.quizId,
      quizTitle: response.quizTitle,
      sentAt: response.sentAt || response.respondedAt,
      respondedAt: response.respondedAt,
      status: (Number(response.summary?.answeredQuestions || response.answers?.length || 0) >= Number(response.summary?.totalQuestions || response.totalQuestions || response.answers?.length || 0)) ? 'responded' : 'partial',
      answers: response.answers,
      summary: response.summary,
      totalQuestions: response.totalQuestions || Number(response.summary?.totalQuestions || response.answers?.length || 0),
      answeredQuestions: response.answeredQuestions || Number(response.summary?.answeredQuestions || response.answers?.length || 0),
      channel: 'email'
    });
  });
  const inDateRange = value => { const date = String(value || '').slice(0, 10); return date && date >= startDate && date <= endDate; };
  return rows.filter(item => inDateRange(item.respondedAt) || inDateRange(item.sentAt)).sort((a, b) => new Date(b.respondedAt || b.sentAt || 0) - new Date(a.respondedAt || a.sentAt || 0));
}

function buildInvitationEmail({ template: rawTemplate, firstName, quizTitle, deadline, questionnaireUrl }) {
  const template = normalizeEmailTemplate(rawTemplate); const values = { firstName:firstName || 'Olá', quizTitle:quizTitle || 'Questionário', deadline, year:new Date().getFullYear() }; const primary = template.primaryColor; const background = template.backgroundColor; const text = template.textColor;   const brand = escapeHtml(template.brandName); const title = escapeHtml(replaceEmailTokens(template.title, values)); const greeting = escapeHtml(replaceEmailTokens(template.greeting, values)); const intro = escapeHtml(replaceEmailTokens(template.intro, values)).replace(/\n/g, '<br>'); const body = escapeHtml(replaceEmailTokens(template.body, values)).replace(/\n/g, '<br>'); const button = escapeHtml(replaceEmailTokens(template.buttonText, values)); const deadlineText = escapeHtml(replaceEmailTokens(template.deadlineText, values)); const footer = escapeHtml(replaceEmailTokens(template.footerText, values)); const safeUrl = escapeHtml(questionnaireUrl); const logoSource = emailAssetUrl(template.logoUrl || template.logoDataUrl); const logo = logoSource ? `<img src="${escapeHtml(logoSource)}" alt="${brand}" width="180" style="display:block;max-width:180px;max-height:64px;height:auto;object-fit:contain;margin:0 0 12px;border:0;outline:none;text-decoration:none">` : ''; const showBrandName = !logoSource || template.showBrandName !== false; const brandMarkup = showBrandName ? `<p style="margin:0 0 5px;color:${primary};font-size:11px;letter-spacing:.12em;text-transform:uppercase;font-weight:800">${brand}</p>` : ''; const softBrandMarkup = showBrandName ? `<p style="margin:0 0 5px;color:#7d73ad;font-size:11px;letter-spacing:.1em;text-transform:uppercase;font-weight:800">${brand}</p>` : ''; const midnightBrandMarkup = showBrandName ? `<p style="margin:0;color:#d4b76a;font-size:11px;letter-spacing:.13em;text-transform:uppercase;font-weight:800">${brand}</p>` : ''; const botanicalBrandMarkup = showBrandName ? `<p style="margin:0 0 5px;color:#557253;font-size:11px;letter-spacing:.1em;text-transform:uppercase;font-weight:800">${brand}</p>` : ''; const terracottaBrandMarkup = showBrandName ? `<p style="margin:0 0 5px;color:#a85f4d;font-size:11px;letter-spacing:.1em;text-transform:uppercase;font-weight:800">${brand}</p>` : ''; const classicBrandMarkup = showBrandName ? `<p style="margin:0 0 5px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;opacity:.9">${brand}</p>` : ''; const paragraphBlock = `${intro ? `<p style="margin:0 0 17px;line-height:1.62">${intro}</p>` : ''}${body ? `<p style="margin:0 0 24px;line-height:1.62">${body}</p>` : ''}${button && safeUrl ? `<p style="margin:0 0 24px"><a href="${safeUrl}" style="display:inline-block;background:${primary};border-radius:${template.layout === 'modern' ? '999px' : '10px'};color:#fff;padding:13px 20px;text-decoration:none;font-weight:700">${button}</a></p>` : ''}${deadlineText ? `<p style="margin:0;color:#6d6255;font-size:12px;line-height:1.6">${deadlineText}</p>` : ''}`;
  let inner;
  if (template.layout === 'modern') inner = `<div style="border-left:7px solid ${primary};background:#fff;padding:30px 28px"><div style="margin-bottom:14px">${logo}${brandMarkup}</div><h1 style="margin:0 0 24px;color:${text};font-size:25px;line-height:1.2">${title}</h1><p style="margin:0 0 20px;color:${text};font-weight:700">${greeting}</p>${paragraphBlock}</div>`;
  else if (template.layout === 'editorial') inner = `<div style="background:#fffdf8;padding:32px 29px;border-top:8px solid ${primary}">${logo ? logo.replace('margin:0 0 12px','margin:0 auto 12px') : ''}<h1 style="margin:0 auto 24px;max-width:430px;text-align:center;color:${text};font-family:Georgia,serif;font-size:26px;font-weight:400;line-height:1.2">${title}</h1><p style="margin:0 0 20px;color:${text};font-family:Georgia,serif;font-size:16px">${greeting}</p>${paragraphBlock}</div>`;
  else if (template.layout === 'soft') inner = `<div style="background:linear-gradient(145deg,#fff,#f1effa);padding:28px;border-radius:24px;border:1px solid #ded9ef">${logo}${softBrandMarkup}<h1 style="margin:0 0 22px;color:${text};font-size:24px;line-height:1.24">${title}</h1><div style="border-radius:16px;background:#fff;padding:21px;box-shadow:0 8px 22px rgba(77,67,112,.08)"><p style="margin:0 0 20px;color:${text};font-weight:700">${greeting}</p>${paragraphBlock}</div></div>`;
  else if (template.layout === 'midnight') inner = `<div style="background:#202532;padding:32px 29px;color:#fff"><div style="padding-bottom:22px;border-bottom:1px solid rgba(212,183,106,.35)">${logo}${midnightBrandMarkup}</div><h1 style="margin:0 0 24px;color:#fff;font-size:25px;line-height:1.2">${title}</h1><p style="margin:0 0 20px;color:#fff;font-weight:700">${greeting}</p><p style="margin:0 0 17px;color:#e7e8ed;line-height:1.62">${intro}</p><p style="margin:0 0 24px;color:#e7e8ed;line-height:1.62">${body}</p><p style="margin:0 0 24px"><a href="${safeUrl}" style="display:inline-block;background:#d4b76a;border-radius:10px;color:#202532;padding:13px 20px;text-decoration:none;font-weight:800">${button}</a></p><p style="margin:0;color:#c5c9d2;font-size:12px;line-height:1.6">${deadlineText}</p></div>`;
  else if (template.layout === 'botanical') inner = `<div style="background:#f1f7ef;padding:30px 27px;border-top:6px solid ${primary}"><div style="padding-bottom:20px;border-bottom:1px solid #cfddca">${logo}${botanicalBrandMarkup}</div><div style="padding:24px 0 0 16px;border-left:3px solid ${primary}"><h1 style="margin:0 0 24px;color:${text};font-size:25px;line-height:1.2">${title}</h1><p style="margin:0 0 20px;color:${text};font-weight:700">${greeting}</p>${paragraphBlock}</div></div>`;
  else if (template.layout === 'terracotta') inner = `<div style="background:#fff4ed;padding:30px 28px"><div style="background:${primary};color:#fff;margin:-30px -28px 26px;padding:20px 28px">${logo}${terracottaBrandMarkup}</div><h1 style="margin:0 0 22px;color:${text};font-size:25px;line-height:1.2">${title}</h1><p style="margin:0 0 20px;color:${text};font-weight:700">${greeting}</p>${paragraphBlock}</div>`;
  else if (template.layout === 'minimal') inner = `<div style="background:#fff;padding:34px 30px;border-top:2px solid ${primary}"><div style="text-align:center">${logo ? logo.replace('margin:0 0 12px','margin:0 auto 12px') : ''}</div><h1 style="margin:0 0 23px;text-align:center;color:${text};font-size:27px;line-height:1.16;font-weight:700">${title}</h1><p style="margin:0 0 20px;color:${text};font-weight:700">${greeting}</p>${paragraphBlock}</div>`;
  else inner = `<div style="background:${primary};color:#fff;padding:25px 28px">${logo}${classicBrandMarkup}<h1 style="margin:0;font-size:24px;line-height:1.25">${title}</h1></div><div style="background:#fff;padding:28px;color:${text}"><p style="margin:0 0 20px;font-weight:700">${greeting}</p>${paragraphBlock}</div>`;
  const footerColor = template.layout === 'midnight' ? '#d4d8e0' : '#827766'; return `<!doctype html><html lang="pt-BR"><head><meta name="color-scheme" content="light"></head><body style="margin:0;background:${background};font-family:Arial,Helvetica,sans-serif;color:${text};line-height:1.6"><div style="max-width:600px;margin:0 auto;padding:32px 18px"><div style="overflow:hidden;border:1px solid rgba(120,100,70,.18);border-radius:${['soft','botanical'].includes(template.layout) ? '24px' : '18px'};box-shadow:0 8px 24px rgba(61,50,38,.1)">${inner}</div><p style="font-size:12px;color:${footerColor};text-align:center;margin:18px 0 0">${footer}</p></div></body></html>`;
}

function buildReminderTestEmail({ reminder: rawReminder, patientName = '' }) {
  const reminder = rawReminder && typeof rawReminder === 'object' ? rawReminder : {};
  const patient = usableText(patientName) || 'Paciente selecionado';
  const values = { firstName:patient.split(/\s+/)[0] || 'Olá', patient, quizTitle:'Acompanhamento semanal', deadline:'15 de setembro de 2026', daysRemaining:'3', questionnaireUrl:`${QUESTIONNAIRE_BASE_URL}?teste=1`, nutritionist:'Jessica Melo', year:new Date().getFullYear() };
  const subject = replaceReminderTokens(usableText(reminder.subject) || 'Teste de lembrete', values).slice(0, 180);
  const message = replaceReminderTokens(usableText(reminder.message) || 'Esta é uma mensagem de teste do lembrete.', values).slice(0, 1200);
  const brand = escapeHtml('Jessica Melo Nutricionista');
  const safeSubject = escapeHtml(subject);
  const safeMessage = escapeHtml(message).replace(/\n/g, '<br>');
  const safeRecipient = escapeHtml(values.questionnaireUrl);
  const title = escapeHtml(usableText(reminder.title) || 'Lembrete');
  const htmlContent = `<!doctype html><html lang="pt-BR"><head><meta name="color-scheme" content="light"></head><body style="margin:0;background:#faf8f3;font-family:Arial,Helvetica,sans-serif;color:#3d3226;line-height:1.6"><div style="max-width:600px;margin:0 auto;padding:32px 18px"><div style="overflow:hidden;border:1px solid rgba(168,139,54,.22);border-radius:18px;background:#fff;box-shadow:0 8px 24px rgba(61,50,38,.1)"><div style="background:#a88b36;color:#fff;padding:25px 28px"><p style="margin:0 0 5px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;opacity:.9">${brand}</p><p style="margin:0 0 8px;font-size:10px;letter-spacing:.1em;text-transform:uppercase;opacity:.82">E-mail de teste</p><h1 style="margin:0;font-size:24px;line-height:1.25">${title}</h1></div><div style="padding:28px"><div style="margin:0 0 22px;border:1px solid #ead9a6;border-radius:12px;background:#fffaf0;padding:13px 15px;color:#725b20;font-size:13px;line-height:1.5"><strong>Mensagem de teste:</strong> este e-mail foi enviado somente para validar o lembrete. O link abaixo é apenas ilustrativo e não representa um convite real.</div><p style="margin:0 0 16px;font-size:16px;font-weight:700;color:#3d3226">${safeSubject}</p><p style="margin:0 0 20px;color:#3d3226;line-height:1.7">${safeMessage}</p><p style="margin:0;color:#6d6255;font-size:12px;line-height:1.6">Os dados exibidos são exemplos e o link acima não representa um convite real.</p><p style="margin:20px 0 0"><a href="${safeRecipient}" style="display:inline-block;background:#a88b36;border-radius:10px;color:#fff;padding:11px 17px;text-decoration:none;font-weight:700">Abrir link de exemplo</a></p></div></div><p style="font-size:12px;color:#827766;text-align:center;margin:18px 0 0">Jessica Melo Nutricionista · Teste de lembrete</p></div></body></html>`;
  return { subject:`Teste de lembrete — ${subject}`.slice(0, 180), htmlContent };
}

const DEFAULT_SERVER_REMINDERS = [
  { id:'new_quiz', title:'Novo Questionário', active:true, email:true, subject:'Seu questionário está pronto', message:'Olá, {primeiro_nome}!\n\nSeu questionário {questionario} já está disponível. Responda quando puder pelo link: {link_questionario}', routine:{ triggers:[{ offset:0, unit:'minutes', relation:'after', time:'' }] } },
  { id:'service_ending', title:'Serviço Finalizando', active:true, email:true, subject:'Seu acompanhamento está chegando ao fim', message:'Olá, {primeiro_nome}!\n\nSeu acompanhamento está próximo do fim. Faltam {dias_restantes} dias para o encerramento. Se precisar de ajuda, fale comigo.', routine:{ triggers:[{ offset:3, unit:'days', relation:'before', time:'' }, { offset:8, unit:'hours', relation:'before', time:'' }] } },
  { id:'response_due', title:'Prazo de Resposta', active:true, email:true, subject:'Lembrete: prazo do questionário', message:'Olá, {primeiro_nome}!\n\nO prazo para responder {questionario} termina em {prazo}. Reserve alguns minutos e envie suas respostas pelo link: {link_questionario}', routine:{ triggers:[{ offset:12, unit:'hours', relation:'before', time:'' }] } }
];
function normalizeServerReminderTrigger(trigger = {}) { const data = trigger && typeof trigger === 'object' ? trigger : {}; const units = ['minutes','hours','days']; const relations = ['before','after']; const offset = Number(data.offset); return { offset:Number.isFinite(offset) ? Math.max(0, Math.min(5256000, Math.round(offset))) : 0, unit:units.includes(data.unit) ? data.unit : 'hours', relation:relations.includes(data.relation) ? data.relation : 'before', time:/^([01]\d|2[0-3]):[0-5]\d$/.test(String(data.time || '')) ? String(data.time) : '' }; }
function normalizeServerReminder(item, fallback) { const data = item && typeof item === 'object' ? item : {}; const routine = data.routine && typeof data.routine === 'object' ? data.routine : {}; const sourceTriggers = Array.isArray(routine.triggers) && routine.triggers.length ? routine.triggers : fallback.routine.triggers; return { ...fallback, ...data, id:fallback.id, title:usableText(data.title) || fallback.title, active:data.active !== false, email:data.email !== false, subject:usableText(data.subject) || fallback.subject, message:usableText(data.message) || fallback.message, routine:{ ...fallback.routine, ...routine, triggers:(sourceTriggers || []).slice(0, 8).map(normalizeServerReminderTrigger) } }; }
function normalizeServerReminders(value) { const list = Array.isArray(value) ? value : []; return DEFAULT_SERVER_REMINDERS.map(fallback => normalizeServerReminder(list.find(item => item?.id === fallback.id), fallback)); }
async function getReminderSettings(sessionToken) { try { const records = await listStoredQuestionnaireRecords(sessionToken); const record = records.find(item => recordTheme(item) === '__patient_reminder_settings__' || recordSource(item) === 'reminder://settings'); if (!record) return normalizeServerReminders([]); let data = []; try { data = JSON.parse(String(record.description || '[]')); } catch {} return normalizeServerReminders(data); } catch (error) { console.error('Reminder settings load error:', error.message); return normalizeServerReminders([]); } }
function formatReminderDeadline(value) { const timestamp = Date.parse(value); return Number.isFinite(timestamp) ? new Intl.DateTimeFormat('pt-BR', { dateStyle:'long', timeZone:'America/Sao_Paulo' }).format(new Date(timestamp)) : ''; }
function reminderDaysRemaining(value) { const timestamp = Date.parse(value); return Number.isFinite(timestamp) ? String(Math.max(0, Math.ceil((timestamp - Date.now()) / 86400000))) : ''; }
function buildReminderEmail({ reminder:rawReminder, template:rawTemplate, patientName = '', quizTitle = '', expiresAt = '', accessToken = '', kind = '' }) { const reminder = rawReminder && typeof rawReminder === 'object' ? rawReminder : {}; const patient = usableText(patientName) || 'Paciente'; const questionnaireUrl = accessToken ? `${QUESTIONNAIRE_BASE_URL}?token=${encodeURIComponent(accessToken)}` : ''; const deadline = formatReminderDeadline(expiresAt); const values = { firstName:patient.split(/\s+/)[0] || 'Olá', patient, quizTitle:usableText(quizTitle) || 'Questionário', deadline, daysRemaining:reminderDaysRemaining(expiresAt), questionnaireUrl, nutritionist:'Jessica Melo' }; const subject = replaceReminderTokens(usableText(reminder.subject) || 'Lembrete', values).slice(0, 180); const message = replaceReminderTokens(usableText(reminder.message) || 'Esta é uma mensagem de acompanhamento.', values); const template = normalizeEmailTemplate({ ...rawTemplate, title:usableText(reminder.title) || 'Lembrete', greeting:'', intro:message, body:'', buttonText:questionnaireUrl ? 'Responder questionário' : '', deadlineText:questionnaireUrl && deadline ? `Este questionário fica disponível até ${deadline}.` : '' }); const htmlContent = buildInvitationEmail({ template, firstName:values.firstName, quizTitle:values.quizTitle, deadline, questionnaireUrl }); return { subject, htmlContent, kind }; }
function reminderOffsetMilliseconds(trigger) { const value = Math.max(0, Number(trigger?.offset || 0)); const unit = trigger?.unit === 'minutes' ? 60000 : trigger?.unit === 'days' ? 86400000 : 3600000; return value * unit; }
function localDateFromTimestamp(timestamp) { const parts = new Intl.DateTimeFormat('en-CA', { timeZone:'America/Sao_Paulo', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(new Date(timestamp)); const pick = type => parts.find(part => part.type === type)?.value || ''; return `${pick('year')}-${pick('month')}-${pick('day')}`; }
function reminderTriggerAt(baseAt, trigger) { const baseTimestamp = Date.parse(baseAt); if (!Number.isFinite(baseTimestamp)) return ''; const direction = trigger?.relation === 'after' ? 1 : -1; const targetTimestamp = baseTimestamp + direction * reminderOffsetMilliseconds(trigger); if (trigger?.time) return localDateTimeToIso(localDateFromTimestamp(targetTimestamp), trigger.time); return new Date(targetTimestamp).toISOString(); }
function addDateKey(dateKey, days) { const date = new Date(`${String(dateKey || '').slice(0, 10)}T12:00:00.000Z`); if (!Number.isFinite(date.getTime())) return ''; date.setUTCDate(date.getUTCDate() + Number(days || 0)); return date.toISOString().slice(0, 10); }
function normalizeStoredServiceLinkForReminder(record) { const data = parseStoredRecord(record); const source = recordSource(record).toLowerCase(); if (recordTheme(record) !== '__patient_service_link__' && !source.startsWith('patient-service-link://')) return null; return { id:usableText(data.id || record?.id), patientKey:usableText(data.patientKey || data.patient_key), patientName:usableText(data.patientName || data.patient_name || record?.title), serviceName:usableText(data.serviceName || data.service_name || data.title || record?.title) || 'acompanhamento nutricional', duration:Math.max(0, Number(data.duration || data.durationDays || data.duration_days || 0)), startDate:usableText(data.startDate || data.start_date), status:usableText(data.status || 'active').toLowerCase() }; }
function normalizeServiceReminderInput(value = {}) {
  const data = value && typeof value === 'object' ? value : {};
  return {
    id: usableText(data.id),
    patientKey: usableText(data.patientKey || data.patient_key),
    patientName: usableText(data.patientName || data.patient_name) || 'Paciente',
    serviceName: usableText(data.serviceName || data.service_name || data.title) || 'acompanhamento nutricional',
    duration: Math.max(0, Math.min(3650, Number(data.duration || data.durationDays || data.duration_days || 0))),
    startDate: usableText(data.startDate || data.start_date).slice(0, 10),
    status: usableText(data.status || 'active').toLowerCase()
  };
}

function serviceReminderEndAt(service) {
  const normalized = normalizeServiceReminderInput(service);
  if (!validDateKey(normalized.startDate) || normalized.duration <= 0) return '';
  const endDate = addDateKey(normalized.startDate, Math.max(0, normalized.duration - 1));
  return localDateTimeToIso(endDate, '23:59');
}

function serviceReminderIsActive(service) {
  return ['active', 'ativo'].includes(String(service?.status || '').toLowerCase());
}

async function findRegisteredPatientForService(sessionToken, service) {
  const normalized = normalizeServiceReminderInput(service);
  const entries = await callRpc('app_list_patients', { p_token:sessionToken });
  const patientKey = normalized.patientKey.toLowerCase();
  const patient = (Array.isArray(entries) ? entries : []).find(item => {
    const id = usableText(item?.id).toLowerCase();
    const email = usableText(item?.email).toLowerCase();
    return id === patientKey || email === patientKey;
  });
  if (!patient || !validEmail(patient.email)) throw new Error('O paciente do vínculo não possui um e-mail válido cadastrado.');
  return { id:usableText(patient.id) || normalized.patientKey, name:usableText(patient.name) || normalized.patientName, email:usableText(patient.email).toLowerCase() };
}

const SERVICE_REMINDER_TERMINAL_STATUSES = new Set(['enviado', 'entregue', 'sent', 'delivered', 'cancelado', 'cancelled', 'expirado', 'expired']);

async function cancelObsoleteServiceReminderSchedules(sessionToken, serviceId, desiredKeys = new Set(), schedules = []) {
  const prefix = `email-reminder:service_ending:${serviceId}:`;
  const candidates = (Array.isArray(schedules) ? schedules : []).filter(schedule => {
    const status = String(schedule?.status || '').toLowerCase();
    return String(schedule?.scheduleKey || '').startsWith(prefix) && !desiredKeys.has(schedule.scheduleKey) && !SERVICE_REMINDER_TERMINAL_STATUSES.has(status);
  });
  let cancelled = 0;
  for (const schedule of candidates) {
    if (schedule.providerMessageId) await cancelBrevoEmail(schedule.providerMessageId);
    await cancelStoredSchedule(sessionToken, schedule);
    cancelled += 1;
  }
  return cancelled;
}

async function cancelResponseDueReminders(invitation) {
  if (!invitation?.sessionToken) return 0;
  let schedules = [];
  try {
    schedules = await listStoredSchedules(invitation.sessionToken, invitation.patientKey);
  } catch (error) {
    console.error('Failed to list schedules for reminder cancellation:', error.message);
    return 0;
  }
  const invitationId = String(invitation.id || '').trim().toLowerCase();
  const quizId = String(invitation.quizId || '').trim().toLowerCase();
  const patientKey = String(invitation.patientKey || '').trim().toLowerCase();
  const recipientEmail = String(invitation.recipientEmail || '').trim().toLowerCase();

  const candidates = (Array.isArray(schedules) ? schedules : []).filter(schedule => {
    const status = String(schedule?.status || '').toLowerCase();
    if (SERVICE_REMINDER_TERMINAL_STATUSES.has(status)) return false;
    const scheduleKey = String(schedule?.scheduleKey || '').toLowerCase();
    const snapshot = schedule?.quizSnapshot && typeof schedule.quizSnapshot === 'object' ? schedule.quizSnapshot : {};
    const emailReminder = snapshot.__emailReminder || {};

    const isResponseDue = emailReminder.kind === 'response_due' || scheduleKey.startsWith('email-reminder:response_due:');
    if (!isResponseDue) return false;

    const matchesInvitation = invitationId && (
      scheduleKey.includes(`:${invitationId}:`) ||
      String(emailReminder.contextId || '').toLowerCase() === invitationId ||
      String(emailReminder.originalInvitationId || '').toLowerCase() === invitationId
    );
    const matchesPatientQuiz = (
      (String(schedule.patientKey || '').toLowerCase() === patientKey || String(schedule.recipientEmail || '').toLowerCase() === recipientEmail) &&
      (String(schedule.quizId || '').toLowerCase() === quizId || String(emailReminder.quizId || '').toLowerCase() === quizId)
    );

    return matchesInvitation || matchesPatientQuiz;
  });

  let cancelled = 0;
  for (const schedule of candidates) {
    if (schedule.providerMessageId) {
      try { await cancelBrevoEmail(schedule.providerMessageId); } catch (err) { console.error('Brevo cancel error for reminder:', err.message); }
    }
    try {
      await cancelStoredSchedule(invitation.sessionToken, schedule);
      cancelled += 1;
    } catch (err) {
      console.error('Database schedule cancel error for reminder:', err.message);
    }
  }
  return cancelled;
}

function buildReminderQueueEntry
({ reminder, kind, trigger, triggerIndex, invitation, quiz, accessToken = '', scheduledAt, expiresAt, referenceAt = '', contextId, serviceName = '', parentScheduleKey = '', scheduleKey = '' }) { const normalizedQuiz = quiz && typeof quiz === 'object' ? quiz : {}; const jobId = `${kind}:${reminder.id}:${contextId}:${triggerIndex}:${scheduledAt}`; const queueExpiresTimestamp = Math.max(Date.parse(expiresAt || '') || 0, Date.parse(scheduledAt) + 86400000); const reminderInvitation = encryptInvitation({ version:2, id:`${invitation.id}:reminder:${jobId}`, sessionToken:invitation.sessionToken, patientKey:invitation.patientKey, patientName:invitation.patientName, recipientEmail:invitation.recipientEmail, quizId:normalizedQuiz.id || `reminder-${contextId}`, quizTitle:normalizedQuiz.title || reminder.title, expiresAt:queueExpiresTimestamp, reminder:true }); return { scheduleKey:scheduleKey || `email-reminder:${jobId}`, patientKey:invitation.patientKey, patientName:invitation.patientName, recipientEmail:invitation.recipientEmail, quizLinkId:invitation.quizLinkId || '', quizId:normalizedQuiz.id || `reminder-${contextId}`, quizTitle:normalizedQuiz.title || reminder.title, quizSnapshot:{ id:normalizedQuiz.id || `reminder-${contextId}`, title:normalizedQuiz.title || reminder.title, questionSnapshots:[], __emailReminder:{ version:1, kind, reminder, triggerIndex, contextId, serviceName, parentScheduleKey, referenceAt:referenceAt || expiresAt, questionnaireAccessToken:accessToken || '', quizId:normalizedQuiz.id || '', quizTitle:normalizedQuiz.title || '' } }, invitationToken:reminderInvitation, scheduledFor:scheduledAt, expiresAt:new Date(queueExpiresTimestamp).toISOString() }; }
function buildReminderJobs({ reminders, records, invitation, quiz, accessToken, scheduledAt, expiresAt, parentScheduleKey = '' }) {
  const jobs = [];
  const now = Date.now() + 11 * 60 * 1000;
  const responseReminder = reminders.find(item => item.id === 'response_due');
  if (responseReminder?.active && responseReminder.email) {
    (responseReminder.routine?.triggers || []).forEach((trigger, triggerIndex) => {
      const reminderAt = reminderTriggerAt(expiresAt, trigger);
      const timestamp = Date.parse(reminderAt);
      if (!Number.isFinite(timestamp) || timestamp <= now || timestamp > Date.now() + 180 * 86400000) return;
      jobs.push(buildReminderQueueEntry({ reminder:responseReminder, kind:'response_due', trigger, triggerIndex, invitation, quiz, accessToken, scheduledAt:reminderAt, expiresAt, referenceAt:expiresAt, contextId:invitation.id, parentScheduleKey }));
    });
  }
  const serviceReminder = reminders.find(item => item.id === 'service_ending');
  if (serviceReminder?.active && serviceReminder.email) {
    records.map(normalizeStoredServiceLinkForReminder).filter(item => item && item.patientKey === invitation.patientKey && item.status === 'active' && item.startDate && item.duration > 0).forEach(service => {
      const endDate = addDateKey(service.startDate, Math.max(0, service.duration - 1));
      const serviceEndAt = localDateTimeToIso(endDate, '23:59');
      (serviceReminder.routine?.triggers || []).forEach((trigger, triggerIndex) => {
        const reminderAt = reminderTriggerAt(serviceEndAt, trigger);
        const timestamp = Date.parse(reminderAt);
        if (!Number.isFinite(timestamp) || timestamp <= now || timestamp > Date.now() + 180 * 86400000) return;
        jobs.push(buildReminderQueueEntry({ reminder:serviceReminder, kind:'service_ending', trigger, triggerIndex, invitation, quiz, accessToken, scheduledAt:reminderAt, expiresAt:reminderAt, referenceAt:serviceEndAt, contextId:service.id || `${service.startDate}:${service.duration}`, serviceName:service.serviceName, parentScheduleKey }));
      });
    });
  }
  return jobs;
}

async function scheduleReminderJobs({ sessionToken, invitation, quiz, accessToken, scheduledAt, expiresAt, parentScheduleKey = '' }) {
  const reminders = await getReminderSettings(sessionToken);
  const records = await listStoredQuestionnaireRecords(sessionToken);
  const jobs = buildReminderJobs({ reminders, records, invitation, quiz, accessToken, scheduledAt, expiresAt, parentScheduleKey });
  if (!jobs.length) return [];
  await enqueueStoredScheduleBatch(sessionToken, jobs);
  return jobs;
}

async function scheduleReminderJobsBatch({ sessionToken, prepared }) {
  const reminders = await getReminderSettings(sessionToken);
  const records = await listStoredQuestionnaireRecords(sessionToken);
  const jobs = (Array.isArray(prepared) ? prepared : []).flatMap(item => buildReminderJobs({ reminders, records, invitation:item.invitation, quiz:item.quiz, accessToken:item.accessToken, scheduledAt:item.scheduledAt || item.scheduledFor, expiresAt:item.expiresAt, parentScheduleKey:item.scheduleKey }));
  if (!jobs.length) return [];
  await enqueueStoredScheduleBatch(sessionToken, jobs);
  return jobs;
}

async function scheduleServiceReminderJobs({ sessionToken, service }) {
  const normalized = normalizeServiceReminderInput(service);
  if (!normalized.id || !normalized.patientKey) throw new Error('O vínculo de serviço não possui uma identificação válida.');
  const reminders = await getReminderSettings(sessionToken);
  const serviceReminder = reminders.find(item => item.id === 'service_ending');
  const schedules = await listStoredSchedules(sessionToken);
  const serviceEndAt = serviceReminderEndAt(normalized);
  const canSchedule = serviceReminder?.active && serviceReminder.email && serviceReminderIsActive(normalized) && serviceEndAt;
  if (!canSchedule) {
    const cancelled = await cancelObsoleteServiceReminderSchedules(sessionToken, normalized.id, new Set(), schedules);
    return { success:true, scheduled:0, cancelled, serviceEndAt };
  }

  const patient = await findRegisteredPatientForService(sessionToken, normalized);
  const invitation = {
    version:2,
    id:`service:${normalized.id}`,
    sessionToken,
    patientKey:normalized.patientKey,
    patientName:patient.name,
    recipientEmail:patient.email,
    quizId:`service-${normalized.id}`,
    quizTitle:normalized.serviceName,
    quizLinkId:'',
    sendMode:'unique',
    sentAt:new Date().toISOString(),
    expiresAt:Date.parse(serviceEndAt) + 86400000
  };
  const quiz = { id:`service-${normalized.id}`, title:normalized.serviceName, questionSnapshots:[] };
  const existingByBase = new Map();
  schedules.filter(item => String(item?.scheduleKey || '').startsWith(`email-reminder:service_ending:${normalized.id}:`)).forEach(item => {
    const key = String(item.scheduleKey || '');
    const base = key.replace(/:rev-\d+$/, '');
    const list = existingByBase.get(base) || [];
    list.push(item);
    existingByBase.set(base, list);
  });
  const jobs = [];
  (serviceReminder.routine?.triggers || []).forEach((trigger, triggerIndex) => {
    const reminderAt = reminderTriggerAt(serviceEndAt, trigger);
    const timestamp = Date.parse(reminderAt);
    if (!Number.isFinite(timestamp) || timestamp <= Date.now() + 11 * 60 * 1000 || timestamp > Date.now() + 180 * 86400000) return;
    const baseKey = `email-reminder:service_ending:${normalized.id}:${serviceReminder.id}:${triggerIndex}:${reminderAt}`;
    const sameBase = existingByBase.get(baseKey) || [];
    const activeExisting = sameBase.find(item => !SERVICE_REMINDER_TERMINAL_STATUSES.has(String(item?.status || '').toLowerCase()));
    const terminalExisting = sameBase.find(item => SERVICE_REMINDER_TERMINAL_STATUSES.has(String(item?.status || '').toLowerCase()));
    const stableKey = activeExisting?.scheduleKey || (terminalExisting ? `${baseKey}:rev-${Date.now()}` : baseKey);
    jobs.push(buildReminderQueueEntry({ reminder:serviceReminder, kind:'service_ending', trigger, triggerIndex, invitation, quiz, scheduledAt:reminderAt, expiresAt:reminderAt, referenceAt:serviceEndAt, contextId:normalized.id, serviceName:normalized.serviceName, scheduleKey:stableKey }));
  });
  const desiredKeys = new Set(jobs.map(item => item.scheduleKey));
  const cancelled = await cancelObsoleteServiceReminderSchedules(sessionToken, normalized.id, desiredKeys, schedules);
  if (!jobs.length) return { success:true, scheduled:0, cancelled, serviceEndAt };
  const queued = await enqueueStoredScheduleBatch(sessionToken, jobs);
  return { success:true, scheduled:queued.length, cancelled, serviceEndAt, schedules:queued };
}

async function sendQuestionnaireEmail
({ recipientEmail, patientName, quiz, accessToken, expiresAt, scheduledAt, template, reminder = null }) {
  const questionnaireUrl = `${QUESTIONNAIRE_BASE_URL}?token=${encodeURIComponent(accessToken)}`; const deadline = new Intl.DateTimeFormat('pt-BR', { dateStyle:'long', timeZone:'America/Sao_Paulo' }).format(new Date(expiresAt)); const firstName = String(patientName || '').trim().split(/\s+/)[0] || 'Olá'; const normalizedTemplate = normalizeEmailTemplate(template); const reminderEmail = reminder && reminder.active !== false && reminder.email !== false ? buildReminderEmail({ reminder, template:normalizedTemplate, patientName, quizTitle:quiz.title, expiresAt, accessToken, kind:'new_quiz' }) : null; const htmlContent = reminderEmail?.htmlContent || buildInvitationEmail({ template:normalizedTemplate, firstName, quizTitle:quiz.title, deadline, questionnaireUrl }); const subject = reminderEmail?.subject || replaceEmailTokens(normalizedTemplate.subject, { firstName, quizTitle:quiz.title, deadline, year:new Date().getFullYear() }); return sendBrevoEmail({ to:{ email:recipientEmail, name:patientName }, subject, htmlContent, scheduledAt, tags:['questionnaire','patient-questionnaire'], replyTo:{ email:process.env.BREVO_REPLY_TO_EMAIL || 'contato@jessicamelonutri.com.br', name:normalizedTemplate.brandName } });
}

async function sendResponseReceipt({ invitation, quiz, answers, summary }) {
  const recipientEmail = process.env.BREVO_QUESTIONNAIRE_RECIPIENT || 'contato@jessicamelonutri.com.br';
  const answerRows = answers.map((answer, index) => `<tr><td style="padding:10px;border-bottom:1px solid #eadfca;vertical-align:top"><strong>${escapeHtml(answer.questionTitle || `Pergunta ${index + 1}`)}</strong></td><td style="padding:10px;border-bottom:1px solid #eadfca;white-space:pre-wrap">${escapeHtml(cleanAnswer(answer.value))}</td></tr>`).join('');
  const htmlContent = `<!doctype html><html lang="pt-BR"><body style="font-family:Arial,Helvetica,sans-serif;color:#3d3226;line-height:1.55"><div style="max-width:720px;margin:0 auto;padding:24px"><h2 style="color:#a88b36">Nova resposta de questionário</h2><p><strong>Paciente:</strong> ${escapeHtml(invitation.patientName)}<br><strong>Questionário:</strong> ${escapeHtml(quiz.title)}<br><strong>Respondido em:</strong> ${escapeHtml(new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date()))}</p><table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #eadfca">${answerRows}</table><p style="font-size:12px;color:#766c5f">Perguntas respondidas: ${Number(summary?.answeredQuestions || answers.length)} de ${Number(summary?.totalQuestions || answers.length)}.</p></div></body></html>`;
  return sendBrevoEmail({
    to: { email: recipientEmail, name: 'Jessica Melo Nutricionista' },
    subject: `Resposta recebida — ${quiz.title} — ${invitation.patientName}`,
    htmlContent
  });
}

function isEmailQuizScheduleRecord(record) {
  const source = recordSource(record).toLowerCase();
  return record?.theme === EMAIL_QUIZ_SCHEDULE_THEME || source.startsWith('email-quiz-schedule://');
}

function normalizeStoredSchedule(record, storage = 'legacy') {
  const data = parseStoredRecord(record);
  return {
    id: usableText(data.scheduleId) || String(record?.id || ''),
    recordId: String(record?.id || ''),
    storage,
    scheduleKey: usableText(data.scheduleKey || data.schedule_key),
    patientKey: usableText(data.patientKey || data.patient_key),
    patientName: usableText(data.patientName || data.patient_name) || 'Paciente',
    recipientEmail: usableText(data.recipientEmail || data.recipient_email).toLowerCase(),
    quizLinkId: usableText(data.quizLinkId || data.quiz_link_id),
    quizId: usableText(data.quizId || data.quiz_id),
    quizTitle: usableText(data.quizTitle || data.quiz_title) || 'Questionário',
    scheduledFor: usableText(data.scheduledFor || data.scheduled_for),
    expiresAt: usableText(data.expiresAt || data.expires_at),
    provider: usableText(data.provider) || 'brevo',
    providerMessageId: usableText(data.providerMessageId || data.provider_message_id),
    providerStatus: usableText(data.providerStatus || data.provider_status),
    status: usableText(data.status) || 'scheduled',
    retryable: data.retryable === true,
    attemptCount: Number(data.attemptCount ?? data.attempt_count ?? 0),
    nextAttemptAt: usableText(data.nextAttemptAt || data.next_attempt_at),
    lastAttemptAt: usableText(data.lastAttemptAt || data.last_attempt_at),
    errorMessage: (data.errorMessage || data.last_error) ? publicQuestionnaireError(data.errorMessage || data.last_error) : '',
    cancelledAt: usableText(data.cancelledAt || data.cancelled_at),
    finalFailureAt: usableText(data.finalFailureAt || data.final_failure_at),
    createdAt: usableText(data.createdAt || data.created_at) || record?.createdAt || record?.created_at || '',
    updatedAt: usableText(data.updatedAt || data.updated_at) || record?.updatedAt || record?.updated_at || ''
  };
}

function normalizeQueueSchedule(record) {
  const data = record && typeof record === 'object' ? record : {};
  return normalizeStoredSchedule({ id:data.id, description:JSON.stringify(data) }, 'queue');
}

async function listLegacyStoredSchedules(sessionToken, patientKey = '', quizLinkId = '') {
  const records = await listStoredQuestionnaireRecords(sessionToken);
  return records.filter(isEmailQuizScheduleRecord).map(record => normalizeStoredSchedule(record, 'legacy')).filter(item => {
    return (!patientKey || item.patientKey === patientKey) && (!quizLinkId || item.quizLinkId === quizLinkId);
  });
}

async function listStoredSchedules(sessionToken, patientKey = '', quizLinkId = '') {
  try {
    const value = await callRpc('app_questionnaire_schedule_list', { p_token:sessionToken, p_patient_key:patientKey || null, p_quiz_link_id:quizLinkId || null });
    return (Array.isArray(value) ? value : []).map(normalizeQueueSchedule);
  } catch (error) {
    console.error('Questionnaire queue list fallback:', error.message);
    return listLegacyStoredSchedules(sessionToken, patientKey, quizLinkId);
  }
}

async function enqueueStoredSchedule(sessionToken, schedule) {
  const value = await callRpc('app_questionnaire_schedule_enqueue', {
    p_token:sessionToken,
    p_schedule_key:schedule.scheduleKey,
    p_patient_key:schedule.patientKey,
    p_patient_name:schedule.patientName,
    p_recipient_email:schedule.recipientEmail,
    p_quiz_link_id:schedule.quizLinkId || '',
    p_quiz_id:schedule.quizId,
    p_quiz_title:schedule.quizTitle,
    p_quiz_snapshot:schedule.quizSnapshot,
    p_invitation_token:schedule.invitationToken,
    p_scheduled_for:schedule.scheduledFor,
    p_expires_at:schedule.expiresAt
  });
  return normalizeQueueSchedule(Array.isArray(value) ? value[0] : value);
}

const SCHEDULE_BATCH_LIMIT = 90;

async function enqueueStoredScheduleBatch(sessionToken, schedules) {
  const list = Array.isArray(schedules) ? schedules : [];
  const result = [];
  for (let start = 0; start < list.length; start += SCHEDULE_BATCH_LIMIT) {
    const chunk = list.slice(start, start + SCHEDULE_BATCH_LIMIT);
    const value = await callRpc('app_questionnaire_schedule_enqueue_batch', {
      p_token:sessionToken,
      p_entries:chunk.map(schedule => ({
        scheduleKey:schedule.scheduleKey,
        patientKey:schedule.patientKey,
        patientName:schedule.patientName,
        recipientEmail:schedule.recipientEmail,
        quizLinkId:schedule.quizLinkId || '',
        quizId:schedule.quizId,
        quizTitle:schedule.quizTitle,
        quizSnapshot:schedule.quizSnapshot,
        invitationToken:schedule.invitationToken,
        scheduledFor:schedule.scheduledFor,
        expiresAt:schedule.expiresAt
      }))
    });
    result.push(...(Array.isArray(value) ? value : []).map(normalizeQueueSchedule));
  }
  return result;
}

async function cancelStoredSchedule(sessionToken, schedule) {
  if (schedule.storage === 'queue') {
    const value = await callRpc('app_questionnaire_schedule_cancel', { p_token:sessionToken, p_schedule_id:schedule.id });
    return normalizeQueueSchedule(Array.isArray(value) ? value[0] : value);
  }
  return { ...schedule, status:'cancelled', providerStatus:'cancelled', cancelledAt:new Date().toISOString() };
}

async function updateStoredScheduleDeadline(sessionToken, schedule, expiresAt, invitationToken = '') {
  if (schedule.storage !== 'queue') throw new Error('Este agendamento antigo precisa ser recadastrado antes de ter o prazo alterado.');
  const value = await callRpc('app_questionnaire_schedule_update_deadline', {
    p_token:sessionToken,
    p_schedule_id:schedule.id,
    p_expires_at:expiresAt,
    p_invitation_token:invitationToken || null
  });
  const raw = Array.isArray(value) ? value[0] : value;
  return { schedule:normalizeQueueSchedule(raw), invitationToken:usableText(raw?.invitation_token || raw?.invitationToken) };
}

async function pauseStoredSchedule(sessionToken, schedule) {
  if (schedule.storage !== 'queue') throw new Error('Este agendamento antigo precisa ser recadastrado antes de ser pausado.');
  const value = await callRpc('app_questionnaire_schedule_pause', { p_token:sessionToken, p_schedule_id:schedule.id });
  return normalizeQueueSchedule(Array.isArray(value) ? value[0] : value);
}

async function resumeStoredSchedule(sessionToken, schedule) {
  if (schedule.storage !== 'queue') throw new Error('Este agendamento antigo precisa ser recadastrado antes de ser retomado.');
  const value = await callRpc('app_questionnaire_schedule_resume', { p_token:sessionToken, p_schedule_id:schedule.id });
  return normalizeQueueSchedule(Array.isArray(value) ? value[0] : value);
}

async function claimQueueSchedules(secret, workerId, limit = 20) {
  const value = await callRpc('app_questionnaire_schedule_claim', { p_secret:secret, p_worker_id:workerId, p_limit:limit });
  return (Array.isArray(value) ? value : []).map(item => item && typeof item === 'object' ? item : {});
}

async function finalizeMissedQueueSchedules(secret) {
  const value = await callRpc('app_questionnaire_schedule_finalize_missed', { p_secret:secret });
  return Number(Array.isArray(value) ? value[0] : value) || 0;
}

async function markQueueProvider(secret, scheduleId, providerMessageId, providerStatus = 'scheduled') {
  const value = await callRpc('app_questionnaire_schedule_mark_provider', { p_secret:secret, p_schedule_id:scheduleId, p_provider_message_id:providerMessageId, p_provider_status:providerStatus });
  return normalizeQueueSchedule(Array.isArray(value) ? value[0] : value);
}
async function markQueueSent(secret, scheduleId, providerMessageId) {
  try {
    const value = await callRpc('app_questionnaire_schedule_mark_sent', { p_secret:secret, p_schedule_id:scheduleId, p_provider_message_id:providerMessageId, p_provider_status:'sent' });
    return normalizeQueueSchedule(Array.isArray(value) ? value[0] : value);
  } catch (error) {
    console.error('Reminder sent-status RPC fallback:', error.message);
    return markQueueProvider(secret, scheduleId, providerMessageId, 'sent');
  }
}

async function markQueueFailure(secret, scheduleId, errorMessage, retryable = true) {
  const value = await callRpc('app_questionnaire_schedule_mark_failure', { p_secret:secret, p_schedule_id:scheduleId, p_error_message:errorMessage, p_retryable:retryable });
  return normalizeQueueSchedule(Array.isArray(value) ? value[0] : value);
}

async function createQuestionnaireSchedule({ sessionToken, patientKey, patientName, recipientEmail, quizLinkId, quiz, scheduledAt, expiresAt, scheduleKey }) {
  const existing = (await listStoredSchedules(sessionToken, patientKey, quizLinkId)).find(item => item.scheduleKey === scheduleKey && !['cancelled', 'cancelado', 'sent', 'enviado', 'delivered', 'entregue'].includes(String(item.status).toLowerCase()));
  if (existing) return { schedule:existing, duplicate:true };
  const invitation = {
    version:2,
    id:randomBytes(12).toString('hex'),
    sessionToken,
    patientKey,
    patientName,
    recipientEmail,
    quizId:quiz.id,
    quizTitle:quiz.title,
    quizLinkId:quizLinkId || '',
    sendMode:emailSendModeFromScheduleKey(scheduleKey) || 'unique',
    scheduleKey:String(scheduleKey || ''),
    sentAt:scheduledAt,
    expiresAt:Date.parse(expiresAt)
  };
  const accessToken = encryptInvitation(invitation);
  const snapshotReminders = await getReminderSettings(sessionToken);
  const snapshotTemplate = await getEmailTemplate(sessionToken);
  const queueQuizSnapshot = { ...quiz, __emailTemplate:snapshotTemplate, __emailReminders:snapshotReminders, __emailNewQuizReminder:snapshotReminders.find(item => item.id === 'new_quiz') };
  const schedule = await enqueueStoredSchedule(sessionToken, {
    scheduleKey,
    patientKey,
    patientName,
    recipientEmail,
    quizLinkId:quizLinkId || '',
    quizId:quiz.id,
    quizTitle:quiz.title,
    quizSnapshot:queueQuizSnapshot,
    invitationToken:accessToken,
    scheduledFor:scheduledAt,
    expiresAt:new Date(expiresAt).toISOString()
  });
  try { await storeInvitation(invitation, quiz); } catch (error) { console.error('Queued invitation history error:', error.message); }
  try { await scheduleReminderJobs({ sessionToken, invitation, quiz, accessToken, scheduledAt, expiresAt:new Date(expiresAt).toISOString(), parentScheduleKey:scheduleKey }); } catch (reminderError) { console.error('Queued reminder scheduling error:', reminderError.message); }
  return { schedule, duplicate:false };
}

async function createQuestionnaireScheduleBatch({ sessionToken, patientKey, patientName, recipientEmail, quizLinkId, quiz, entries }) {
  const snapshotReminders = await getReminderSettings(sessionToken);
  const snapshotTemplate = await getEmailTemplate(sessionToken);
  const prepared = entries.map((entry, index) => {
    const scheduledAt = validateQueueScheduledAt(entry.scheduledAt || localDateTimeToIso(entry.date, entry.time));
    const expiresAt = responseDeadline(scheduledAt, entry.responseAmount, entry.responseUnit);
    const scheduleKey = String(entry.scheduleKey || `${quizLinkId || quiz.id}:daily:${index}:${scheduledAt}`);
    const sendMode = normalizeEmailSendMode(entry.sendMode) || emailSendModeFromScheduleKey(scheduleKey) || 'daily';
    const invitation = {
      version:2,
      id:randomBytes(12).toString('hex'),
      sessionToken,
      patientKey,
      patientName,
      recipientEmail,
      quizId:quiz.id,
      quizTitle:quiz.title,
      quizLinkId:quizLinkId || '',
      sendMode,
      scheduleKey,
      sentAt:scheduledAt,
      expiresAt:Date.parse(expiresAt)
    };
    return {
      scheduleKey,
      patientKey,
      patientName,
      recipientEmail,
      quizLinkId:quizLinkId || '',
      quizId:quiz.id,
      quizTitle:quiz.title,
      quizSnapshot:{ ...quiz, __emailTemplate:snapshotTemplate, __emailReminders:snapshotReminders, __emailNewQuizReminder:snapshotReminders.find(item => item.id === 'new_quiz') },
      invitationToken:encryptInvitation(invitation),
      scheduledFor:scheduledAt,
      scheduledAt,
      expiresAt,
      invitation,
      accessToken:encryptInvitation(invitation)
    };
  });
  const schedules = await enqueueStoredScheduleBatch(sessionToken, prepared);
  try { await scheduleReminderJobsBatch({ sessionToken, prepared:prepared.map(item => ({ ...item, quiz })) }); } catch (reminderError) { console.error('Batch reminder scheduling error:', reminderError.message); }
  return { schedules, failed:[], message:'Envios diários colocados na fila de agendamento.' };
}

async function listSchedulesWithProviderStatus(sessionToken, patientKey = '', quizLinkId = '') {
  const schedules = await listStoredSchedules(sessionToken, patientKey, quizLinkId);
  return Promise.all(schedules.map(async schedule => {
    if (!schedule.providerMessageId || !['agendado_na_brevo', 'scheduled', 'queued', 'pending'].includes(String(schedule.status).toLowerCase())) return schedule;
    try {
      const provider = await getBrevoEmailStatus(schedule.providerMessageId);
      const providerStatus = usableText(provider.status || provider.messageStatus || provider.event);
      const mapped = scheduleStatusFromProvider(providerStatus, schedule.status);
      return { ...schedule, providerStatus, status: schedule.storage === 'queue' ? ({ scheduled:'agendado_na_brevo', sent:'enviado', failed:'falha_de_agendamento', cancelled:'cancelado' }[mapped] || mapped) : mapped };
    } catch (error) {
      console.error('Brevo schedule status error:', error.message);
      return schedule;
    }
  })).then(items => items.sort((a, b) => new Date(a.scheduledFor || 0) - new Date(b.scheduledFor || 0)));
}

function localDateTimeToIso(date, time) {
  const normalizedDate = String(date || '').trim();
  const normalizedTime = String(time || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate) || !/^\d{2}:\d{2}$/.test(normalizedTime)) return '';
  const timestamp = Date.parse(`${normalizedDate}T${normalizedTime}:00-03:00`);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : '';
}

function responseDeadline(scheduledAt, amount, unit) {
  const numericAmount = Math.max(1, Math.min(Number(amount || 2), 60));
  const multiplier = unit === 'hours' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  return new Date(Date.parse(scheduledAt) + (numericAmount * multiplier)).toISOString();
}

async function createBrevoScheduledQuestionnaire(args) {
  return createQuestionnaireSchedule(args);
}

function validateQueueScheduledAt(value) {
  const timestamp = Date.parse(String(value || ''));
  if (!Number.isFinite(timestamp)) throw new Error('Informe uma data e um horário válidos para o envio.');
  if (timestamp < Date.now() + 3600_000) throw new Error('O agendamento requer uma margem de segurança de pelo menos 1 hora de antecedência.');
  if (timestamp > Date.now() + (180 * 24 * 60 * 60 * 1000)) throw new Error('O agendamento não pode ultrapassar 180 dias.');
  return new Date(timestamp).toISOString();
}

function workerSecretFromRequest(req, body = {}) {
  const authorization = String(req?.headers?.authorization || req?.headers?.Authorization || '');
  const headerSecret = authorization.replace(/^Bearer\s+/i, '').trim();
  return headerSecret || String(body.schedulerSecret || body.secret || '').trim();
}

async function processQuestionnaireQueue(secret, workerId = 'supabase-pg-cron') {
  const finalized = await finalizeMissedQueueSchedules(secret);
  let totalClaimed = 0;
  const processed = [];
  const failed = [];
  
  while (true) {
    const claimed = await claimQueueSchedules(secret, workerId, 50);
    if (!claimed || claimed.length === 0) break;
    totalClaimed += claimed.length;
    
    for (const schedule of claimed) {
      const scheduledAt = new Date(schedule.scheduled_for).toISOString();
      const expiresAt = new Date(schedule.expires_at).toISOString();
      try {
        const snapshot = schedule.quiz_snapshot && typeof schedule.quiz_snapshot === 'object' ? schedule.quiz_snapshot : null;
        const invitation = decryptInvitation(schedule.invitation_token);
        const template = snapshot?.__emailTemplate && typeof snapshot.__emailTemplate === 'object' ? snapshot.__emailTemplate : await getEmailTemplate(invitation.sessionToken);
        if (snapshot?.__emailReminder) {
          if (snapshot.__emailReminder.kind === 'response_due') {
            const records = await listStoredQuestionnaireRecords(invitation.sessionToken);
            const contextId = String(snapshot.__emailReminder.contextId || snapshot.__emailReminder.originalInvitationId || '').trim().toLowerCase();
            const patientKey = String(schedule.patient_key || invitation.patientKey || '').trim().toLowerCase();
            const recipientEmail = String(schedule.recipient_email || invitation.recipientEmail || '').trim().toLowerCase();
            const quizId = String(schedule.quiz_id || snapshot.__emailReminder.quizId || '').trim().toLowerCase();

            const isAlreadyAnswered = records.some(record => {
              if (!isEmailQuizResponseRecord(record)) return false;
              const source = recordSource(record).toLowerCase();
              if (contextId && source === `email-quiz-response://${contextId}`) return true;
              const data = parseStoredRecord(record);
              if (contextId && String(data.invitationId || '').toLowerCase() === contextId) return true;
              const resPatientKey = String(data.patientKey || '').toLowerCase();
              const resEmail = String(data.recipientEmail || '').toLowerCase();
              const resQuizId = String(data.quizId || '').toLowerCase();
              const matchPatient = (patientKey && resPatientKey === patientKey) || (recipientEmail && resEmail === recipientEmail);
              return matchPatient && quizId && resQuizId === quizId;
            });

            if (isAlreadyAnswered) {
              console.log(`[Queue Worker] Lembrete de prazo ignorado: questionário já respondido para ${schedule.patient_name || schedule.recipient_email}`);
              await cancelStoredSchedule(invitation.sessionToken, normalizeQueueSchedule(schedule));
              if (schedule.provider_message_id) {
                try { await cancelBrevoEmail(schedule.provider_message_id); } catch {}
              }
              processed.push({ id:schedule.id, status:'cancelled', reason:'already_answered', kind:'response_due' });
              continue;
            }
          }

          const reminderEmail = buildReminderEmail({ reminder:snapshot.__emailReminder.reminder, template, patientName:schedule.patient_name, quizTitle:snapshot.__emailReminder.quizTitle || schedule.quiz_title, expiresAt:snapshot.__emailReminder.referenceAt || Date.parse(expiresAt), accessToken:snapshot.__emailReminder.questionnaireAccessToken || '', kind:snapshot.__emailReminder.kind });
          const reminderResult = await sendBrevoEmail({ to:{ email:schedule.recipient_email, name:schedule.patient_name }, subject:reminderEmail.subject, htmlContent:reminderEmail.htmlContent, scheduledAt, tags:['questionnaire-reminder', snapshot.__emailReminder.kind], replyTo:{ email:process.env.BREVO_REPLY_TO_EMAIL || 'contato@jessicamelonutri.com.br', name:template.brandName } });
          const reminderProviderMessageId = usableText(reminderResult.messageId);
          if (!reminderProviderMessageId) throw new Error('O provedor não retornou o identificador do lembrete.');
          const reminderStored = await markQueueProvider(secret, schedule.id, reminderProviderMessageId, 'scheduled');
          processed.push({ id:schedule.id, providerMessageId:reminderProviderMessageId, scheduledFor:scheduledAt, status:reminderStored.status, kind:snapshot.__emailReminder.kind });
          continue;
        }
        const quiz = snapshot;
        if (!quiz?.id || !Array.isArray(quiz.questionSnapshots) || !quiz.questionSnapshots.length) throw new Error('A versão salva do questionário não está disponível.');
        const reminders = Array.isArray(snapshot?.__emailReminders) ? snapshot.__emailReminders : await getReminderSettings(invitation.sessionToken);
        const newQuizReminder = snapshot?.__emailNewQuizReminder || reminders.find(item => item.id === 'new_quiz');
        try { await storeInvitation(invitation, quiz); } catch (historyError) { console.error('Queued invitation history error:', historyError.message); }
        const brevoResult = await sendQuestionnaireEmail({
          recipientEmail:schedule.recipient_email,
          patientName:schedule.patient_name,
          quiz,
          accessToken:schedule.invitation_token,
          expiresAt:Date.parse(expiresAt),
          scheduledAt,
          template,
          reminder:newQuizReminder
        });
        const providerMessageId = usableText(brevoResult.messageId);
        if (!providerMessageId) throw new Error('A Brevo não retornou o messageId do agendamento.');
        const stored = await markQueueProvider(secret, schedule.id, providerMessageId, 'scheduled');
        try { await storeInvitation({ ...invitation, providerMessageId }, quiz); } catch (historyError) { console.error('Queued provider id history error:', historyError.message); }
        processed.push({ id:schedule.id, providerMessageId, scheduledFor:scheduledAt, status:stored.status });
      } catch (error) {
        const message = error?.message || 'Falha técnica ao preparar o envio do questionário.';
        try { await markQueueFailure(secret, schedule.id, message, true); } catch (markError) { console.error('Queue failure persistence error:', markError.message); }
        failed.push({ id:schedule.id, scheduledFor:scheduledAt, message:publicQuestionnaireError(message) });
      }
    }
  }

  if (totalClaimed > 0) {
    try {
      const htmlContent = `
        <div style="font-family: sans-serif; color: #333;">
          <h2 style="color: #a88b36;">Relatório Diário de Agendamentos</h2>
          <p>A automação (Cron) processou os e-mails da janela de 71 horas.</p>
          <p><strong>${processed.length}</strong> e-mails foram inseridos com sucesso na Brevo.</p>
          ${failed.length > 0 ? `<p style="color: #d9534f;"><strong>Atenção:</strong> ${failed.length} envios falharam ao serem adicionados.</p>` : ''}
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="font-size: 0.9em; color: #666;">
            <strong>Nota sobre pendentes:</strong><br/>
            Os envios programados para prazos superiores a 71 horas permanecem pendentes e seguros no banco de dados. 
            Eles serão automaticamente inseridos na Brevo pelas próximas execuções diárias, assim que entrarem na janela de 71 horas.
          </p>
        </div>
      `;
      await sendBrevoEmail({
        to: { email: 'kayodavids@gmail.com', name: 'Kayo David' },
        subject: `[Vercel Cron] Relatório de Envios - ${processed.length} adicionados na Brevo`,
        htmlContent,
        tags: ['cron-report'],
        replyTo: { email: process.env.BREVO_REPLY_TO_EMAIL || 'contato@jessicamelonutri.com.br', name: 'Sistema de Agendamento' }
      });
    } catch (reportError) {
      console.error('Failed to send report email:', reportError.message);
    }
  }

  return { success:true, finalized, claimed:totalClaimed, processed, failed, workerId };
}

function requestBody(req) {
  if (req.method === 'GET') return req.query || {};
  return req.body || {};
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { success: false, message: 'Método não permitido.' });
  const body = requestBody(req);
  const action = String(body.action || '').trim();

  try {
    if (action === 'worker') {
      const secret = workerSecretFromRequest(req, body);
      const expected = String(process.env.QUESTIONNAIRE_SCHEDULER_SECRET || '').trim();
      const cronSecret = String(process.env.CRON_SECRET || '').trim();
      if (!secret || (secret !== expected && (!cronSecret || secret !== cronSecret))) return json(res, 401, { success:false, message:'Worker não autorizado.' });
      const workerId = String(req?.headers?.['x-worker-id'] || body.workerId || 'vercel-cron');
      const result = await processQuestionnaireQueue(secret, workerId);
      return json(res, 200, result);
    }

    if (action === 'test-reminder') {
      const sessionToken = String(body.sessionToken || '');
      const patientKey = String(body.patientKey || '').trim();
      const requestedEmail = String(body.recipientEmail || '').trim().toLowerCase();
      if (!sessionToken) return json(res, 400, { success:false, message:'Não foi possível iniciar o teste. Entre novamente no painel.' });
      await requireAdmin(sessionToken);
      if (!patientKey || !validEmail(requestedEmail)) return json(res, 400, { success:false, message:'Selecione um paciente cadastrado com e-mail válido antes de enviar o teste.' });
      const patient = await findRegisteredPatientForTest(sessionToken, patientKey, requestedEmail);
      if (!patient) return json(res, 400, { success:false, message:'O paciente selecionado não foi encontrado ou não possui o e-mail informado no cadastro.' });
      const reminder = body.reminder && typeof body.reminder === 'object' ? body.reminder : {};
      const { subject, htmlContent } = buildReminderTestEmail({ reminder, patientName:patient.name });
      try {
        await sendBrevoEmail({ to:{ email:patient.email, name:patient.name }, subject, htmlContent, replyTo:{ email:process.env.BREVO_REPLY_TO_EMAIL || 'contato@jessicamelonutri.com.br', name:'Jessica Melo Nutricionista' }, tags:['reminder-test','questionnaire-test'] });
        return json(res, 200, { success:true, message:`E-mail de teste enviado para ${patient.email}.`, recipientEmail:patient.email, patientKey:patient.id, patientName:patient.name });
      } catch (error) {
        console.error('Reminder test email error:', error.message);
        return json(res, 502, { success:false, message:'Não foi possível enviar o e-mail de teste. Tente novamente e, caso o problema se repita, entre em contato com o suporte.' });
      }
    }

    if (action === 'sync-service-reminder') {
      const sessionToken = String(body.sessionToken || '');
      if (!sessionToken) return json(res, 400, { success:false, message:'Não foi possível sincronizar o lembrete do serviço. Entre novamente no painel.' });
      await requireAdmin(sessionToken);
      const result = await scheduleServiceReminderJobs({ sessionToken, service:body.service });
      return json(res, 200, result);
    }

    if (action === 'send') {
      const sessionToken = String(body.sessionToken || '');
      const patientKey = String(body.patientKey || '').trim();
      const patientName = String(body.patientName || '').trim();
      const recipientEmail = String(body.recipientEmail || '').trim().toLowerCase();
      const quizId = String(body?.quiz?.id || body.quizId || '').trim();
      const quizLinkId = String(body.quizLinkId || '').trim();
      const requestedSendMode = normalizeEmailSendMode(body.sendMode);
      const expiresInDays = Math.max(1, Math.min(Number(body.expiresInDays || 7), 7));
      if (!sessionToken || !patientKey || !validEmail(recipientEmail) || !quizId) return json(res, 400, { success: false, message: 'Não foi possível preparar o convite. Confira o paciente, o e-mail e o questionário.' });
      await requireAdmin(sessionToken);
      const quiz = await loadQuiz(sessionToken, quizId);
      const expiresAt = Date.now() + (expiresInDays * 24 * 60 * 60 * 1000);
      const sentAt = new Date().toISOString();
      const invitation = { version: 2, id: randomBytes(12).toString('hex'), sessionToken, patientKey, patientName, recipientEmail, quizId: quiz.id, quizLinkId, sendMode:requestedSendMode || 'unique', sentAt, expiresAt };
      const accessToken = encryptInvitation(invitation);
      const template = await getEmailTemplate(sessionToken);
      const reminders = await getReminderSettings(sessionToken);
      const newQuizReminder = reminders.find(item => item.id === 'new_quiz');
      const brevoResult = await sendQuestionnaireEmail({ recipientEmail, patientName, quiz, accessToken, expiresAt, template, reminder:newQuizReminder });
      await storeInvitation({ ...invitation, providerMessageId:brevoResult.messageId || '' }, quiz);
      try { await scheduleReminderJobs({ sessionToken, invitation, quiz, accessToken, scheduledAt:sentAt, expiresAt:new Date(expiresAt).toISOString() }); } catch (reminderError) { console.error('Immediate reminder scheduling error:', reminderError.message); }
      return json(res, 200, { success: true, message: 'Questionário enviado por e-mail.', expiresAt: new Date(expiresAt).toISOString(), providerMessageId: brevoResult.messageId || null });
    }


    if (action === 'schedule-batch') {
      const sessionToken = String(body.sessionToken || '');
      const patientKey = String(body.patientKey || '').trim();
      const patientName = String(body.patientName || '').trim();
      const recipientEmail = String(body.recipientEmail || '').trim().toLowerCase();
      const quizId = String(body?.quiz?.id || body.quizId || '').trim();
      const quizLinkId = String(body.quizLinkId || '').trim();
      const entries = Array.isArray(body.entries) ? body.entries.slice(0, 180) : [];
      if (!sessionToken || !patientKey || !validEmail(recipientEmail) || !quizId || !entries.length) return json(res, 400, { success:false, message:'Não foi possível preparar o agendamento. Confira o paciente, o e-mail, o questionário e as datas.' });
      await requireAdmin(sessionToken);
      const quiz = await loadQuiz(sessionToken, quizId);
      if (entries.length > 32) {
        try {
          const result = await createQuestionnaireScheduleBatch({ sessionToken, patientKey, patientName, recipientEmail, quizLinkId, quiz, entries });
          if (process.env.CRON_SECRET) { try { await processQuestionnaireQueue(process.env.CRON_SECRET, 'immediate-schedule-trigger-batch'); } catch (triggerError) { console.error('Immediate queue trigger failed:', triggerError.message); } }
          return json(res, 200, { success:true, schedules:result.schedules, failed:result.failed, message:result.message });
        } catch (error) {
          return json(res, 502, { success:false, message:publicQuestionnaireError(error.message, 'Houve um erro ao agendar o questionário. Tente novamente e, caso o problema se repita, entre em contato com o suporte.'), schedules:[], failed:[] });
        }
      }
      const schedules = [];
      const failed = [];
      for (const entry of entries) {
        try {
          const scheduledAt = validateQueueScheduledAt(entry.scheduledAt || localDateTimeToIso(entry.date, entry.time));
          const expiresAt = responseDeadline(scheduledAt, entry.responseAmount, entry.responseUnit);
          const scheduleKey = String(entry.scheduleKey || (quizLinkId || quiz.id) + ':' + scheduledAt);
          const result = await createBrevoScheduledQuestionnaire({ sessionToken, patientKey, patientName, recipientEmail, quizLinkId, quiz, scheduledAt, expiresAt, scheduleKey });
          schedules.push({ ...result.schedule, duplicate: result.duplicate });
        } catch (error) {
          failed.push({ scheduledAt: entry.scheduledAt || '', message:publicQuestionnaireError(error.message, 'Houve um erro ao agendar o questionário. Tente novamente e, caso o problema se repita, entre em contato com o suporte.') });
        }
      }
      if (!schedules.length && failed.length) return json(res, 502, { success:false, message:failed[0].message, schedules, failed });
      if (process.env.CRON_SECRET) { try { await processQuestionnaireQueue(process.env.CRON_SECRET, 'immediate-schedule-trigger'); } catch (triggerError) { console.error('Immediate queue trigger failed:', triggerError.message); } }
      return json(res, 200, { success:true, schedules, failed, message:failed.length ? 'Alguns envios foram colocados na fila e outros precisam de revisão.' : 'Envios colocados na fila de agendamento.' });
    }

    if (action === 'list-schedules') {
      const sessionToken = String(body.sessionToken || '');
      if (!sessionToken) return json(res, 400, { success:false, message:'Sessão administrativa não encontrada.' });
      await requireAdmin(sessionToken);
      const schedules = await listSchedulesWithProviderStatus(sessionToken, String(body.patientKey || '').trim(), String(body.quizLinkId || '').trim());
      return json(res, 200, { success:true, schedules, updatedAt:new Date().toISOString() });
    }

    if (action === 'pause-schedule') {
      const sessionToken = String(body.sessionToken || '');
      const scheduleId = String(body.scheduleId || '').trim();
      if (!sessionToken || !scheduleId) return json(res, 400, { success:false, message:'Agendamento não identificado.' });
      await requireAdmin(sessionToken);
      const schedule = (await listStoredSchedules(sessionToken)).find(item => item.id === scheduleId || item.recordId === scheduleId);
      if (!schedule) return json(res, 404, { success:false, message:'Agendamento não encontrado.' });
      if (['cancelled', 'cancelado', 'sent', 'enviado', 'delivered', 'entregue', 'failed', 'falha_de_agendamento', 'expirado'].includes(String(schedule.status).toLowerCase())) return json(res, 409, { success:false, message:'Este agendamento não pode mais ser pausado.' });
      if (schedule.providerMessageId && !['cancelled', 'cancelado', 'sent', 'enviado', 'delivered', 'entregue', 'failed', 'falha_de_agendamento'].includes(String(schedule.status).toLowerCase())) await cancelBrevoEmail(schedule.providerMessageId);
      const updated = await pauseStoredSchedule(sessionToken, schedule);
      return json(res, 200, { success:true, schedule:updated });
    }

    if (action === 'resume-schedule') {
      const sessionToken = String(body.sessionToken || '');
      const scheduleId = String(body.scheduleId || '').trim();
      if (!sessionToken || !scheduleId) return json(res, 400, { success:false, message:'Agendamento não identificado.' });
      await requireAdmin(sessionToken);
      const schedule = (await listStoredSchedules(sessionToken)).find(item => item.id === scheduleId || item.recordId === scheduleId);
      if (!schedule) return json(res, 404, { success:false, message:'Agendamento não encontrado.' });
      if (String(schedule.status).toLowerCase() !== 'pausado') return json(res, 409, { success:false, message:'Este agendamento não está pausado.' });
      const updated = await resumeStoredSchedule(sessionToken, schedule);
      return json(res, 200, { success:true, schedule:updated });
    }

    if (action === 'cancel-schedule') {
      const sessionToken = String(body.sessionToken || '');
      const scheduleId = String(body.scheduleId || '').trim();
      if (!sessionToken || !scheduleId) return json(res, 400, { success:false, message:'Agendamento não identificado.' });
      await requireAdmin(sessionToken);
      const schedule = (await listStoredSchedules(sessionToken)).find(item => item.id === scheduleId || item.recordId === scheduleId);
      if (!schedule) return json(res, 404, { success:false, message:'Agendamento não encontrado.' });
      if (schedule.providerMessageId && !['cancelled', 'sent', 'failed'].includes(schedule.status)) await cancelBrevoEmail(schedule.providerMessageId);
      const updated = await cancelStoredSchedule(sessionToken, schedule);
      return json(res, 200, { success:true, schedule:updated });
    }

    if (action === 'cancel-link-schedules') {
      const sessionToken = String(body.sessionToken || '');
      const quizLinkId = String(body.quizLinkId || '').trim();
      if (!sessionToken || !quizLinkId) return json(res, 400, { success:false, message:'Vínculo não identificado.' });
      await requireAdmin(sessionToken);
      const schedules = await listStoredSchedules(sessionToken, '', quizLinkId);
      const activeSchedules = schedules.filter(item => !['cancelled', 'cancelado', 'sent', 'enviado', 'delivered', 'entregue'].includes(String(item.status).toLowerCase()));
      const updatedSchedules = [];
      for (const schedule of activeSchedules) {
        if (schedule.providerMessageId && !['cancelled', 'cancelado', 'sent', 'enviado', 'failed', 'falha_de_agendamento'].includes(String(schedule.status).toLowerCase())) {
          try { await cancelBrevoEmail(schedule.providerMessageId); } catch (e) { console.error('Brevo cancel error:', e.message); }
        }
        try {
          const updated = await cancelStoredSchedule(sessionToken, schedule);
          updatedSchedules.push(updated);
        } catch (e) {
          console.error('Cancel schedule error:', e.message);
        }
      }
      return json(res, 200, { success:true, message:`Foram cancelados ${updatedSchedules.length} agendamentos.`, cancelled: updatedSchedules.length });
    }

    if (action === 'reschedule-schedule') {
      const sessionToken = String(body.sessionToken || '');
      const scheduleId = String(body.scheduleId || '').trim();
      if (!sessionToken || !scheduleId) return json(res, 400, { success:false, message:'Agendamento não identificado.' });
      await requireAdmin(sessionToken);
      const previous = (await listStoredSchedules(sessionToken)).find(item => item.id === scheduleId || item.recordId === scheduleId);
      if (!previous) return json(res, 404, { success:false, message:'Agendamento não encontrado.' });
      const previousScheduledAt = Date.parse(previous.scheduledFor || '');
      const requestedScheduledAt = body.scheduledAt || localDateTimeToIso(body.date, body.time);
      const requestedTimestamp = Date.parse(requestedScheduledAt || '');
      if (!Number.isFinite(previousScheduledAt)) return json(res, 409, { success:false, message:'A data original deste agendamento não pôde ser identificada.' });

      // Uma série histórica pode continuar aberta na tela mesmo depois que a data
      // de envio passou. Nesse caso, quando o usuário mantém a data/horário e
      // altera somente o prazo, não tentamos recriar um envio no passado — apenas
      // atualizamos o prazo da fila existente. Se a data mudou, o fluxo normal de
      // reagendamento futuro continua sendo usado.
      const sameScheduledMoment = Number.isFinite(requestedTimestamp) && Math.abs(requestedTimestamp - previousScheduledAt) <= 60_000;
      if (previousScheduledAt <= Date.now() + 30_000 && sameScheduledMoment) {
        const expiresAt = responseDeadline(previous.scheduledFor, body.responseAmount, body.responseUnit);
        const updated = await updateStoredScheduleDeadline(sessionToken, previous, expiresAt);
        return json(res, 200, { success:true, mode:'deadline-only', previousScheduleId:previous.id, schedule:updated.schedule, message:'Prazo de resposta atualizado.' });
      }

      const scheduledAt = validateQueueScheduledAt(requestedScheduledAt);
      if (previous.providerMessageId && !['cancelled', 'cancelado', 'sent', 'enviado', 'failed', 'falha_de_agendamento'].includes(String(previous.status).toLowerCase())) await cancelBrevoEmail(previous.providerMessageId);
      await cancelStoredSchedule(sessionToken, previous);
      const quiz = await loadQuiz(sessionToken, previous.quizId);
      const expiresAt = responseDeadline(scheduledAt, body.responseAmount, body.responseUnit);
      const result = await createBrevoScheduledQuestionnaire({ sessionToken, patientKey:previous.patientKey, patientName:previous.patientName, recipientEmail:previous.recipientEmail, quizLinkId:previous.quizLinkId, quiz, scheduledAt, expiresAt, scheduleKey:(previous.scheduleKey || (previous.quizLinkId || previous.quizId)) + ':reschedule:' + Date.now() });
      return json(res, 200, { success:true, mode:'rescheduled', previousScheduleId:previous.id, schedule:result.schedule });
    }

    if (action === 'click') {
      let invitation;
      try { invitation = decryptInvitation(String(body.token || '')); } catch (error) { return json(res, 200, { success:false, reason:/expirado/i.test(error.message) ? 'expired' : 'invalid' }); }
      await storeClick(invitation);
      return json(res, 200, { success:true });
    }

    if (action === 'get') {
      try {
        const invitation = decryptInvitation(String(body.token || ''));
        await storeClick(invitation);
        const quiz = await loadQuiz(invitation.sessionToken, invitation.quizId);
        const records = await listStoredQuestionnaireRecords(invitation.sessionToken);
        const responseRecord = records.filter(isEmailQuizResponseRecord).map(normalizeStoredResponse).find(response => response.invitationId === invitation.id || responseTargetScore(response, invitation) >= 0);
        const savedResponse = responseRecord || null;
        if (savedResponse) return json(res, 200, { state:'answered', patient_name:invitation.patientName, quiz_title:quiz.title, summary:savedResponse.summary || null });
        const progressRecord = records.find(record => isEmailQuizProgressRecord(record) && normalizeStoredProgress(record).invitationId === invitation.id);
        const savedProgress = progressRecord ? normalizeStoredProgress(progressRecord) : null;
        const preferences = await getPlatformPreferences(invitation.sessionToken);
        const emojiScaleDisplayMode = EMOJI_SCALE_DISPLAY_MODES.has(preferences?.emojiScaleDisplayMode) ? preferences.emojiScaleDisplayMode : 'emoji-text';
        return json(res, 200, { state: 'ready', patient_name: invitation.patientName, quiz_title: quiz.title, quiz, expires_at: new Date(invitation.expiresAt).toISOString(), progress: savedProgress ? { totalQuestions:savedProgress.totalQuestions, answeredQuestions:savedProgress.answeredQuestions, updatedAt:savedProgress.updatedAt } : null, emojiScaleDisplayMode });
      } catch (error) {
        return json(res, 200, { state: /expirado/i.test(error.message) ? 'expired' : 'invalid' });
      }
    }

    if (action === 'progress') {
      let invitation;
      try { invitation = decryptInvitation(String(body.token || '')); } catch (error) { return json(res, 200, { success:false, reason:/expirado/i.test(error.message) ? 'expired' : 'invalid' }); }
      const quiz = await loadQuiz(invitation.sessionToken, invitation.quizId);
      const answeredQuestions = Math.max(0, Math.min(Number(body.answeredQuestions || 0), quiz.questionSnapshots.length));
      if (answeredQuestions > 0) await storeProgress(invitation, quiz, answeredQuestions);
      return json(res, 200, { success:true });
    }

    if (action === 'submit') {
      let invitation;
      try { invitation = decryptInvitation(String(body.token || '')); } catch (error) { return json(res, 200, { success: false, reason: /expirado/i.test(error.message) ? 'expired' : 'invalid' }); }
      const answers = Array.isArray(body.answers) ? body.answers : [];
      if (!answers.length || answers.length > 100) return json(res, 400, { success: false, message: 'As respostas informadas são inválidas.' });
      const quiz = await loadQuiz(invitation.sessionToken, invitation.quizId);
      const normalizedAnswers = answers.map(answer => enrichResponseAnswer(quiz, answer));
      const responseSummary = calculateResponseSummary(quiz, normalizedAnswers, body.responseSummary || {});
      const saved = await storeResponse(invitation, quiz, normalizedAnswers, responseSummary);
      if (!saved) return json(res, 200, { success: false, reason: 'already_answered' });
      try { await cancelResponseDueReminders(invitation); } catch (cancelError) { console.error('Questionnaire response cancel reminders error:', cancelError.message); }
      try { await sendResponseReceipt({ invitation, quiz, answers:normalizedAnswers, summary: responseSummary }); } catch (error) { console.error('Questionnaire response receipt error:', error.message); }
      return json(res, 200, { success: true, quiz_title: quiz.title, summary: responseSummary });
    }

    if (action === 'responses-report') {
      const sessionToken = String(body.sessionToken || '');
      const startDate = String(body.startDate || '');
      const endDate = String(body.endDate || '');
      if (!sessionToken || !validDateKey(startDate) || !validDateKey(endDate) || startDate > endDate) return json(res, 400, { success:false, message:'Informe um período válido para consultar as respostas.' });
      await requireAdmin(sessionToken);
      const responses = await getStoredResponseReport(sessionToken, startDate, endDate);
      return json(res, 200, { success:true, responses, countingStartedAt:RESPONSE_REPORT_COUNTING_START_AT, updatedAt:new Date().toISOString() });
    }

    if (action === 'report') {
      const sessionToken = String(body.sessionToken || '');
      const startDate = String(body.startDate || '');
      const endDate = String(body.endDate || '');
      if (!sessionToken || !validDateKey(startDate) || !validDateKey(endDate) || startDate > endDate) return json(res, 400, { success:false, message:'Informe um período válido para consultar os envios.' });
      const windowDays = Math.ceil((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000) + 1;
      if (windowDays > 90) return json(res, 400, { success:false, message:'O período máximo para consulta é de 90 dias.' });
      await requireAdmin(sessionToken);
      const countingStartAt = Date.parse(EMAIL_REPORT_COUNTING_START_AT);
      const isAfterCountingStart = item => {
        const sentAt = Date.parse(item?.sentAt || '');
        return Number.isFinite(sentAt) && (!Number.isFinite(countingStartAt) || sentAt >= countingStartAt);
      };
      const records = await listStoredQuestionnaireRecords(sessionToken);
      const invitations = records.filter(isEmailQuizInvitationRecord).map(normalizeStoredInvitation).filter(item => item.invitationId && isAfterCountingStart(item));
      const clicks = records.filter(isEmailQuizClickRecord).map(normalizeStoredClick).filter(item => item.invitationId);
      const responses = records.filter(isEmailQuizResponseRecord).map(normalizeStoredResponse);
      const providerEvents = (await getBrevoQuestionnaireEvents(startDate, endDate, invitations)).filter(isAfterCountingStart);
      const events = mergeQuestionnaireEmailStates(providerEvents, invitations, clicks, responses);
      let schedules = [];
      try { schedules = await listStoredSchedules(sessionToken); } catch (error) { console.error('Email report schedule context error:', error.message); }
      const enrichedEvents = enrichEmailSendModes(events, invitations, records, schedules);
      return json(res, 200, { success:true, channel:'email', events:enrichedEvents, countingStartedAt:EMAIL_REPORT_COUNTING_START_AT, updatedAt:new Date().toISOString() });
    }

    if (action === 'list') {
      const sessionToken = String(body.sessionToken || '');
      if (!sessionToken) return json(res, 400, { success:false, message:'Sessão administrativa não encontrada.' });
      await requireAdmin(sessionToken);
      const records = await listStoredQuestionnaireRecords(sessionToken);
      const patientKey = String(body.patientKey || '').trim();
      const invitations = records.filter(isEmailQuizInvitationRecord).map(normalizeStoredInvitation).filter(item => !patientKey || item.patientKey === patientKey);
      return json(res, 200, { success:true, invitations });
    }
    return json(res, 400, { success: false, message: 'Ação inválida.' });
  } catch (error) {
    console.error('Questionnaire email error:', error.message);
    const message = /expirado/i.test(error.message) ? 'Este convite expirou. Solicite um novo questionário.' : 'Não foi possível processar o questionário por e-mail. Tente novamente em alguns minutos.';
    return json(res, 500, { success: false, message });
  }
}
