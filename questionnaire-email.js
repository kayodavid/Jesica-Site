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
const EMAIL_QUIZ_SCHEDULE_THEME = '__email_quiz_schedule__';
const EMAIL_TEMPLATE_THEME = '__email_quiz_template__';
const EMAIL_TEMPLATE_SOURCE = 'email-quiz-template://default';

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

function defaultEmailTemplate() {
  return { version:1, id:'default', layout:'classic', logoUrl:'', logoDataUrl:'', brandName:'Jessica Melo Nutricionista', preheader:'Novo questionário disponível', title:'Novo questionário disponível', greeting:'Olá, {primeiro_nome}!', intro:'A Dra. Jessica preparou o questionário {questionario} para acompanhar o seu cuidado nutricional.', body:'Reserve alguns minutos para responder. Suas respostas serão enviadas de forma segura para o acompanhamento profissional.', buttonText:'Responder questionário', deadlineText:'Este convite é individual e fica disponível até {prazo}.', footerText:'© {ano} Jessica Melo Nutricionista. Todos os direitos reservados.', subject:'Questionário disponível — {questionario}', primaryColor:'#a88b36', backgroundColor:'#faf8f3', textColor:'#3d3226' };
}

function normalizeEmailTemplate(value) {
  const fallback = defaultEmailTemplate(); const data = value && typeof value === 'object' ? value : {}; const layouts = new Set(['classic','modern','editorial','soft','midnight']);
  const color = (candidate, fallbackColor) => /^#[0-9a-f]{6}$/i.test(String(candidate || '')) ? String(candidate).toLowerCase() : fallbackColor;
  const logoDataUrl = /^data:image\/(?:png|jpe?g|webp|gif|svg\+xml);base64,[a-z0-9+/=\s]+$/i.test(String(data.logoDataUrl || '')) && String(data.logoDataUrl).length <= 700000 ? String(data.logoDataUrl) : '';
  const logoUrl = String(data.logoUrl || '').trim().slice(0, 1000);
  return { ...fallback, ...data, version:1, id:'default', layout:layouts.has(data.layout) ? data.layout : fallback.layout, logoUrl, logoDataUrl, brandName:String(data.brandName || fallback.brandName).trim().slice(0,100), preheader:String(data.preheader || fallback.preheader).trim().slice(0,180), title:String(data.title || fallback.title).trim().slice(0,160), greeting:String(data.greeting || fallback.greeting).trim().slice(0,180), intro:String(data.intro || fallback.intro).trim().slice(0,500), body:String(data.body || fallback.body).trim().slice(0,700), buttonText:String(data.buttonText || fallback.buttonText).trim().slice(0,80), deadlineText:String(data.deadlineText || fallback.deadlineText).trim().slice(0,260), footerText:String(data.footerText || fallback.footerText).trim().slice(0,260), subject:String(data.subject || fallback.subject).trim().slice(0,180), primaryColor:color(data.primaryColor, fallback.primaryColor), backgroundColor:color(data.backgroundColor, fallback.backgroundColor), textColor:color(data.textColor, fallback.textColor), updatedAt:String(data.updatedAt || '') };
}

function emailAssetUrl(value) {
  const raw = String(value || '').trim(); if (!raw) return '';
  if (/^data:image\/(?:png|jpe?g|webp|gif|svg\+xml);base64,[a-z0-9+/=\s]+$/i.test(raw) && raw.length <= 700000) return raw;
  try { const parsed = new URL(raw, 'https://jessicamelonutri.com.br'); if (!['http:','https:'].includes(parsed.protocol)) return ''; return parsed.href; } catch { return ''; }
}

function replaceEmailTokens(value, values) { return String(value || '').replace(/\{primeiro_nome\}/g, values.firstName).replace(/\{questionario\}/g, values.quizTitle).replace(/\{prazo\}/g, values.deadline).replace(/\{ano\}/g, values.year); }

async function getEmailTemplate(sessionToken) {
  try { const records = await listStoredQuestionnaireRecords(sessionToken); const record = records.find(item => item?.theme === EMAIL_TEMPLATE_THEME || recordSource(item) === EMAIL_TEMPLATE_SOURCE); if (!record) return defaultEmailTemplate(); let data = {}; try { data = JSON.parse(record.description || '{}'); } catch {} return normalizeEmailTemplate(data); } catch (error) { console.error('Email template load error:', error.message); return defaultEmailTemplate(); }
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

async function sendBrevoEmail({ to, subject, htmlContent, replyTo, scheduledAt }) {
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
      ...(scheduledAt ? { scheduledAt } : {})
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

function normalizeBrevoQuestionnaireEvents(events) {
  const grouped = new Map();
  (Array.isArray(events) ? events : []).forEach(item => {
    const subject = String(item?.subject || '');
    if (!/^Questionário disponível\s*[—-]/i.test(subject)) return;
    const email = String(item?.email || '').trim().toLowerCase();
    const messageId = String(item?.['message-id'] || item?.messageId || item?.message_id || '');
    const occurredAt = Number(item?.ts_epoch || item?.ts_event || (Number(item?.ts || 0) * 1000) || Date.parse(item?.date || '')) || 0;
    const key = messageId || `${email}|${subject}|${Math.floor(occurredAt / 60_000)}`;
    const event = String(item?.event || '').toLowerCase();
    const existing = grouped.get(key) || { id:key, email, subject, sentAt:occurredAt || null, events:[] };
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
    return {
      id:item.id,
      email:item.email,
      subject:item.subject,
      sentAt:requestedAt ? new Date(requestedAt).toISOString() : '',
      deliveredAt:deliveredAt ? new Date(deliveredAt).toISOString() : '',
      openedAt:openedAt ? new Date(openedAt).toISOString() : '',
      clickedAt:clickedAt ? new Date(clickedAt).toISOString() : '',
      failed,
      status:failed ? 'failed' : (clickedAt ? 'clicked' : (openedAt ? 'opened' : (deliveredAt ? 'delivered' : 'sent')))
    };
  }).filter(item => item.sentAt).sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt));
}

async function getBrevoQuestionnaireEvents(startDate, endDate) {
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
  return normalizeBrevoQuestionnaireEvents(data?.events || data?.data || []);
}

function recordSource(record) {
  return String(record?.embedUrl || record?.embed_url || '');
}

function isEmailQuizInvitationRecord(record) {
  return record?.theme === EMAIL_QUIZ_INVITATION_THEME || /^email-quiz-invitation:\/\/[a-z0-9_-]+$/i.test(recordSource(record));
}

function isEmailQuizResponseRecord(record) {
  return record?.theme === EMAIL_QUIZ_RESPONSE_THEME || /^email-quiz-response:\/\/[a-z0-9_-]+$/i.test(recordSource(record));
}

function isEmailQuizProgressRecord(record) {
  return record?.theme === EMAIL_QUIZ_PROGRESS_THEME || /^email-quiz-progress:\/\/[a-z0-9_-]+$/i.test(recordSource(record));
}

function parseStoredRecord(record) {
  try { return JSON.parse(String(record?.description || '{}')); } catch { return {}; }
}

function normalizeStoredInvitation(record) {
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
    sentAt: usableText(data.sentAt) || record?.createdAt || record?.created_at || '',
    expiresAt: usableText(data.expiresAt),
    channel: 'email'
  };
}

function normalizeStoredResponse(record) {
  const data = parseStoredRecord(record);
  return {
    id: String(record?.id || ''),
    invitationId: usableText(data.invitationId),
    patientKey: usableText(data.patientKey),
    patientName: usableText(data.patientName) || 'Paciente',
    recipientEmail: usableText(data.recipientEmail).toLowerCase(),
    quizId: usableText(data.quizId),
    quizTitle: usableText(data.quizTitle) || 'Questionário',
    sentAt: usableText(data.sentAt),
    respondedAt: usableText(data.respondedAt) || record?.createdAt || record?.created_at || '',
    answers: Array.isArray(data.answers) ? data.answers : [],
    summary: data.summary && typeof data.summary === 'object' ? data.summary : {},
    totalQuestions: Math.max(0, Number(data.summary?.totalQuestions || data.totalQuestions || 0)),
    answeredQuestions: Math.max(0, Number(data.summary?.answeredQuestions || (Array.isArray(data.answers) ? data.answers.length : 0))),
    channel: 'email'
  };
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

function safeStoredAnswer(answer) {
  const value = cleanAnswer(answer?.value);
  const isImage = /^data:image\//i.test(value);
  const rawScore = Number.isFinite(Number(answer?.rawScore)) ? Number(answer.rawScore) : (Number.isFinite(Number(answer?.score)) ? Number(answer.score) : 0);
  const weight = Number.isFinite(Number(answer?.weight)) ? Number(answer.weight) : null;
  return {
    questionId: usableText(answer?.questionId),
    questionCode: usableText(answer?.questionCode),
    questionTitle: usableText(answer?.questionTitle) || 'Pergunta',
    type: usableText(answer?.type) || 'single',
    label: usableText(answer?.label),
    evaluationLabel: usableText(answer?.evaluationLabel) || usableText(answer?.ratingLabel),
    evaluationEmoji: usableText(answer?.evaluationEmoji) || usableText(answer?.ratingEmoji),
    score: Number.isFinite(Number(answer?.score)) ? Number(answer.score) : 0,
    rawScore,
    weight,
    scored: answer?.scored === true || Number.isFinite(Number(answer?.rawScore)),
    value: isImage ? '[Imagem enviada pelo paciente]' : value
  };
}
function responseScoreBand(scorePercent) {
  const percent = Number(scorePercent);
  if (!Number.isFinite(percent)) return { label:'Sem avaliação', emoji:'—' };
  if (percent >= 80) return { label:'Ótimo', emoji:'😍' };
  if (percent >= 60) return { label:'Bom', emoji:'🙂' };
  if (percent >= 40) return { label:'Neutro', emoji:'😐' };
  if (percent >= 20) return { label:'Ruim', emoji:'😕' };
  return { label:'Péssimo', emoji:'😣' };
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
    evaluationEmoji: usableText(answer?.evaluationEmoji) || usableText(setting?.emoji) || (question.type === 'emoji' ? usableText(answer?.value) : '')
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
  if (records.some(record => recordSource(record) === source)) return;
  await addStoredRecord(invitation.sessionToken, {
    title: `Envio — ${quiz.title} — ${invitation.patientName || invitation.recipientEmail}`,
    theme: EMAIL_QUIZ_INVITATION_THEME,
    source,
    description: {
      version: 1,
      invitationId: invitation.id,
      patientKey: invitation.patientKey,
      patientName: invitation.patientName,
      recipientEmail: invitation.recipientEmail,
      quizId: quiz.id,
      quizTitle: quiz.title,
      sentAt: invitation.sentAt || new Date().toISOString(),
      expiresAt: new Date(invitation.expiresAt).toISOString(),
      totalQuestions: Array.isArray(quiz.questionSnapshots) ? quiz.questionSnapshots.length : 0
    }
  });
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
  const invitations = records.filter(isEmailQuizInvitationRecord).map(normalizeStoredInvitation).filter(item => item.invitationId);
  const responses = records.filter(isEmailQuizResponseRecord).map(normalizeStoredResponse).filter(item => item.invitationId);
  const progress = records.filter(isEmailQuizProgressRecord).map(normalizeStoredProgress).filter(item => item.invitationId);
  const responsesByInvitation = new Map(responses.map(item => [item.invitationId, item]));
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
    const isComplete = !!response && (totalQuestions === 0 || answeredQuestions >= totalQuestions);
    const status = isComplete ? 'responded' : (isExpired ? (hasProgress ? 'partial' : 'lost') : (hasProgress ? 'progress' : 'open'));
    return {
      id: invitation.invitationId,
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
  return rows.filter(item => {
    const date = String(item.sentAt || item.respondedAt || '').slice(0, 10);
    return date && date >= startDate && date <= endDate;
  }).sort((a, b) => new Date(b.respondedAt || b.sentAt || 0) - new Date(a.respondedAt || a.sentAt || 0));
}

function buildInvitationEmail({ template: rawTemplate, firstName, quizTitle, deadline, questionnaireUrl }) {
  const template = normalizeEmailTemplate(rawTemplate); const values = { firstName:firstName || 'Olá', quizTitle:quizTitle || 'Questionário', deadline, year:new Date().getFullYear() }; const primary = template.primaryColor; const background = template.backgroundColor; const text = template.textColor; const brand = escapeHtml(template.brandName); const preheader = escapeHtml(replaceEmailTokens(template.preheader, values)); const title = escapeHtml(replaceEmailTokens(template.title, values)); const greeting = escapeHtml(replaceEmailTokens(template.greeting, values)); const intro = escapeHtml(replaceEmailTokens(template.intro, values)); const body = escapeHtml(replaceEmailTokens(template.body, values)); const button = escapeHtml(replaceEmailTokens(template.buttonText, values)); const deadlineText = escapeHtml(replaceEmailTokens(template.deadlineText, values)); const footer = escapeHtml(replaceEmailTokens(template.footerText, values)); const safeUrl = escapeHtml(questionnaireUrl); const logoSource = emailAssetUrl(template.logoDataUrl || template.logoUrl); const logo = logoSource ? `<img src="${escapeHtml(logoSource)}" alt="${brand}" style="display:block;max-width:190px;max-height:64px;height:auto;object-fit:contain;margin:0 0 12px">` : ''; const paragraphBlock = `<p style="margin:0 0 17px;line-height:1.62">${intro}</p><p style="margin:0 0 24px;line-height:1.62">${body}</p><p style="margin:0 0 24px"><a href="${safeUrl}" style="display:inline-block;background:${primary};border-radius:${template.layout === 'modern' ? '999px' : '10px'};color:#fff;padding:13px 20px;text-decoration:none;font-weight:700">${button}</a></p><p style="margin:0;color:#6d6255;font-size:12px;line-height:1.6">${deadlineText}</p>`;
  let inner;
  if (template.layout === 'modern') inner = `<div style="border-left:7px solid ${primary};background:#fff;padding:30px 28px"><div style="margin-bottom:14px">${logo}<p style="margin:0;color:${primary};font-size:11px;letter-spacing:.12em;text-transform:uppercase;font-weight:800">${brand}</p></div><p style="margin:0 0 6px;color:#756b61;font-size:11px;letter-spacing:.08em;text-transform:uppercase">${preheader}</p><h1 style="margin:0 0 24px;color:${text};font-size:25px;line-height:1.2">${title}</h1><p style="margin:0 0 20px;color:${text};font-weight:700">${greeting}</p>${paragraphBlock}</div>`;
  else if (template.layout === 'editorial') inner = `<div style="background:#fffdf8;padding:32px 29px;border-top:8px solid ${primary}">${logo ? logo.replace('margin:0 0 12px','margin:0 auto 12px') : ''}<p style="margin:0 0 12px;text-align:center;color:#827766;font-size:10px;letter-spacing:.16em;text-transform:uppercase">${preheader}</p><h1 style="margin:0 auto 24px;max-width:430px;text-align:center;color:${text};font-family:Georgia,serif;font-size:26px;font-weight:400;line-height:1.2">${title}</h1><p style="margin:0 0 20px;color:${text};font-family:Georgia,serif;font-size:16px">${greeting}</p>${paragraphBlock}</div>`;
  else if (template.layout === 'soft') inner = `<div style="background:linear-gradient(145deg,#fff,#f1effa);padding:28px;border-radius:24px;border:1px solid #ded9ef">${logo}<p style="margin:0 0 5px;color:#7d73ad;font-size:11px;letter-spacing:.1em;text-transform:uppercase;font-weight:800">${brand}</p><h1 style="margin:0 0 22px;color:${text};font-size:24px;line-height:1.24">${title}</h1><div style="border-radius:16px;background:#fff;padding:21px;box-shadow:0 8px 22px rgba(77,67,112,.08)"><p style="margin:0 0 20px;color:${text};font-weight:700">${greeting}</p>${paragraphBlock}</div></div>`;
  else if (template.layout === 'midnight') inner = `<div style="background:#202532;padding:32px 29px;color:#fff"><div style="padding-bottom:22px;border-bottom:1px solid rgba(212,183,106,.35)">${logo}<p style="margin:0;color:#d4b76a;font-size:11px;letter-spacing:.13em;text-transform:uppercase;font-weight:800">${brand}</p></div><p style="margin:22px 0 7px;color:#d4b76a;font-size:10px;letter-spacing:.13em;text-transform:uppercase">${preheader}</p><h1 style="margin:0 0 24px;color:#fff;font-size:25px;line-height:1.2">${title}</h1><p style="margin:0 0 20px;color:#fff;font-weight:700">${greeting}</p><p style="margin:0 0 17px;color:#e7e8ed;line-height:1.62">${intro}</p><p style="margin:0 0 24px;color:#e7e8ed;line-height:1.62">${body}</p><p style="margin:0 0 24px"><a href="${safeUrl}" style="display:inline-block;background:#d4b76a;border-radius:10px;color:#202532;padding:13px 20px;text-decoration:none;font-weight:800">${button}</a></p><p style="margin:0;color:#c5c9d2;font-size:12px;line-height:1.6">${deadlineText}</p></div>`;
  else inner = `<div style="background:${primary};color:#fff;padding:25px 28px">${logo}<p style="margin:0 0 5px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;opacity:.9">${brand}</p><p style="margin:0 0 8px;font-size:10px;letter-spacing:.1em;text-transform:uppercase;opacity:.75">${preheader}</p><h1 style="margin:0;font-size:24px;line-height:1.25">${title}</h1></div><div style="background:#fff;padding:28px;color:${text}"><p style="margin:0 0 20px;font-weight:700">${greeting}</p>${paragraphBlock}</div>`;
  const footerColor = template.layout === 'midnight' ? '#d4d8e0' : '#827766'; return `<!doctype html><html lang="pt-BR"><head><meta name="color-scheme" content="light"></head><body style="margin:0;background:${background};font-family:Arial,Helvetica,sans-serif;color:${text};line-height:1.6"><div style="max-width:600px;margin:0 auto;padding:32px 18px"><div style="overflow:hidden;border:1px solid rgba(120,100,70,.18);border-radius:${template.layout === 'soft' ? '24px' : '18px'};box-shadow:0 8px 24px rgba(61,50,38,.1)">${inner}</div><p style="font-size:12px;color:${footerColor};text-align:center;margin:18px 0 0">${footer}</p></div></body></html>`;
}

async function sendQuestionnaireEmail({ recipientEmail, patientName, quiz, accessToken, expiresAt, scheduledAt, template }) {
  const questionnaireUrl = `${QUESTIONNAIRE_BASE_URL}?token=${encodeURIComponent(accessToken)}`; const deadline = new Intl.DateTimeFormat('pt-BR', { dateStyle:'long', timeZone:'America/Sao_Paulo' }).format(new Date(expiresAt)); const firstName = String(patientName || '').trim().split(/\s+/)[0] || 'Olá'; const normalizedTemplate = normalizeEmailTemplate(template); const htmlContent = buildInvitationEmail({ template:normalizedTemplate, firstName, quizTitle:quiz.title, deadline, questionnaireUrl }); return sendBrevoEmail({ to:{ email:recipientEmail, name:patientName }, subject:replaceEmailTokens(normalizedTemplate.subject, { firstName, quizTitle:quiz.title, deadline, year:new Date().getFullYear() }), htmlContent, scheduledAt, replyTo:{ email:process.env.BREVO_REPLY_TO_EMAIL || 'contato@jessicamelonutri.com.br', name:normalizedTemplate.brandName } });
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
    errorMessage: usableText(data.errorMessage || data.last_error),
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

async function enqueueStoredScheduleBatch(sessionToken, schedules) {
  const value = await callRpc('app_questionnaire_schedule_enqueue_batch', {
    p_token:sessionToken,
    p_entries:schedules.map(schedule => ({
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
  return (Array.isArray(value) ? value : []).map(normalizeQueueSchedule);
}

async function cancelStoredSchedule(sessionToken, schedule) {
  if (schedule.storage === 'queue') {
    const value = await callRpc('app_questionnaire_schedule_cancel', { p_token:sessionToken, p_schedule_id:schedule.id });
    return normalizeQueueSchedule(Array.isArray(value) ? value[0] : value);
  }
  return { ...schedule, status:'cancelled', providerStatus:'cancelled', cancelledAt:new Date().toISOString() };
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
    sentAt:scheduledAt,
    expiresAt:Date.parse(expiresAt)
  };
  const accessToken = encryptInvitation(invitation);
  const schedule = await enqueueStoredSchedule(sessionToken, {
    scheduleKey,
    patientKey,
    patientName,
    recipientEmail,
    quizLinkId:quizLinkId || '',
    quizId:quiz.id,
    quizTitle:quiz.title,
    quizSnapshot:quiz,
    invitationToken:accessToken,
    scheduledFor:scheduledAt,
    expiresAt:new Date(expiresAt).toISOString()
  });
  try { await storeInvitation(invitation, quiz); } catch (error) { console.error('Queued invitation history error:', error.message); }
  return { schedule, duplicate:false };
}

async function createQuestionnaireScheduleBatch({ sessionToken, patientKey, patientName, recipientEmail, quizLinkId, quiz, entries }) {
  const prepared = entries.map((entry, index) => {
    const scheduledAt = validateQueueScheduledAt(entry.scheduledAt || localDateTimeToIso(entry.date, entry.time));
    const expiresAt = responseDeadline(scheduledAt, entry.responseAmount, entry.responseUnit);
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
      sentAt:scheduledAt,
      expiresAt:Date.parse(expiresAt)
    };
    return {
      scheduleKey:String(entry.scheduleKey || `${quizLinkId || quiz.id}:daily:${index}:${scheduledAt}`),
      patientKey,
      patientName,
      recipientEmail,
      quizLinkId:quizLinkId || '',
      quizId:quiz.id,
      quizTitle:quiz.title,
      quizSnapshot:quiz,
      invitationToken:encryptInvitation(invitation),
      scheduledFor:scheduledAt,
      expiresAt
    };
  });
  const schedules = await enqueueStoredScheduleBatch(sessionToken, prepared);
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
  if (timestamp <= Date.now() + 30_000) throw new Error('O horário agendado precisa estar no futuro.');
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
  const claimed = await claimQueueSchedules(secret, workerId, 20);
  const processed = [];
  const failed = [];
  for (const schedule of claimed) {
    const scheduledAt = new Date(schedule.scheduled_for).toISOString();
    const expiresAt = new Date(schedule.expires_at).toISOString();
    try {
      const quiz = schedule.quiz_snapshot && typeof schedule.quiz_snapshot === 'object' ? schedule.quiz_snapshot : null;
      if (!quiz?.id || !Array.isArray(quiz.questionSnapshots) || !quiz.questionSnapshots.length) throw new Error('A versão salva do questionário não está disponível.');
      const invitation = decryptInvitation(schedule.invitation_token);
      const template = await getEmailTemplate(invitation.sessionToken);
      try { await storeInvitation(invitation, quiz); } catch (historyError) { console.error('Queued invitation history error:', historyError.message); }
      const brevoResult = await sendQuestionnaireEmail({
        recipientEmail:schedule.recipient_email,
        patientName:schedule.patient_name,
        quiz,
        accessToken:schedule.invitation_token,
        expiresAt:Date.parse(expiresAt),
        scheduledAt,
        template
      });
      const providerMessageId = usableText(brevoResult.messageId);
      if (!providerMessageId) throw new Error('A Brevo não retornou o messageId do agendamento.');
      const stored = await markQueueProvider(secret, schedule.id, providerMessageId, 'scheduled');
      processed.push({ id:schedule.id, providerMessageId, scheduledFor:scheduledAt, status:stored.status });
    } catch (error) {
      const message = error?.message || 'Não foi possível cadastrar o envio na Brevo.';
      try { await markQueueFailure(secret, schedule.id, message, true); } catch (markError) { console.error('Queue failure persistence error:', markError.message); }
      failed.push({ id:schedule.id, scheduledFor:scheduledAt, message });
    }
  }
  return { success:true, finalized, claimed:claimed.length, processed, failed, workerId };
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
      if (!secret || !expected || secret !== expected) return json(res, 401, { success:false, message:'Worker não autorizado.' });
      const workerId = String(req?.headers?.['x-worker-id'] || body.workerId || 'supabase-pg-cron');
      const result = await processQuestionnaireQueue(secret, workerId);
      return json(res, 200, result);
    }

    if (action === 'send') {
      const sessionToken = String(body.sessionToken || '');
      const patientKey = String(body.patientKey || '').trim();
      const patientName = String(body.patientName || '').trim();
      const recipientEmail = String(body.recipientEmail || '').trim().toLowerCase();
      const quizId = String(body?.quiz?.id || body.quizId || '').trim();
      const expiresInDays = Math.max(1, Math.min(Number(body.expiresInDays || 7), 7));
      if (!sessionToken || !patientKey || !validEmail(recipientEmail) || !quizId) return json(res, 400, { success: false, message: 'Não foi possível preparar o convite. Confira o paciente, o e-mail e o questionário.' });
      await requireAdmin(sessionToken);
      const quiz = await loadQuiz(sessionToken, quizId);
      const expiresAt = Date.now() + (expiresInDays * 24 * 60 * 60 * 1000);
      const sentAt = new Date().toISOString();
      const invitation = { version: 2, id: randomBytes(12).toString('hex'), sessionToken, patientKey, patientName, recipientEmail, quizId: quiz.id, sentAt, expiresAt };
      const accessToken = encryptInvitation(invitation);
      const template = await getEmailTemplate(sessionToken);
      const brevoResult = await sendQuestionnaireEmail({ recipientEmail, patientName, quiz, accessToken, expiresAt, template });
      await storeInvitation(invitation, quiz);
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
          return json(res, 200, { success:true, schedules:result.schedules, failed:result.failed, message:result.message });
        } catch (error) {
          return json(res, 502, { success:false, message:error.message || 'Não foi possível cadastrar a série diária.', schedules:[], failed:[] });
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
          failed.push({ scheduledAt: entry.scheduledAt || '', message: error.message || 'Não foi possível cadastrar este envio.' });
        }
      }
      if (!schedules.length && failed.length) return json(res, 502, { success:false, message:failed[0].message, schedules, failed });
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

    if (action === 'reschedule-schedule') {
      const sessionToken = String(body.sessionToken || '');
      const scheduleId = String(body.scheduleId || '').trim();
      const scheduledAt = validateQueueScheduledAt(body.scheduledAt || localDateTimeToIso(body.date, body.time));
      if (!sessionToken || !scheduleId) return json(res, 400, { success:false, message:'Agendamento não identificado.' });
      await requireAdmin(sessionToken);
      const previous = (await listStoredSchedules(sessionToken)).find(item => item.id === scheduleId || item.recordId === scheduleId);
      if (!previous) return json(res, 404, { success:false, message:'Agendamento não encontrado.' });
      if (previous.providerMessageId && !['cancelled', 'cancelado', 'sent', 'enviado', 'failed', 'falha_de_agendamento'].includes(String(previous.status).toLowerCase())) await cancelBrevoEmail(previous.providerMessageId);
      await cancelStoredSchedule(sessionToken, previous);
      const quiz = await loadQuiz(sessionToken, previous.quizId);
      const expiresAt = responseDeadline(scheduledAt, body.responseAmount, body.responseUnit);
      const result = await createBrevoScheduledQuestionnaire({ sessionToken, patientKey:previous.patientKey, patientName:previous.patientName, recipientEmail:previous.recipientEmail, quizLinkId:previous.quizLinkId, quiz, scheduledAt, expiresAt, scheduleKey:(previous.scheduleKey || (previous.quizLinkId || previous.quizId)) + ':reschedule:' + Date.now() });
      return json(res, 200, { success:true, previousScheduleId:previous.id, schedule:result.schedule });
    }

    if (action === 'get') {
      try {
        const invitation = decryptInvitation(String(body.token || ''));
        const quiz = await loadQuiz(invitation.sessionToken, invitation.quizId);
        const records = await listStoredQuestionnaireRecords(invitation.sessionToken);
        const responseRecord = records.find(record => isEmailQuizResponseRecord(record) && normalizeStoredResponse(record).invitationId === invitation.id);
        const savedResponse = responseRecord ? normalizeStoredResponse(responseRecord) : null;
        if (savedResponse) return json(res, 200, { state:'answered', patient_name:invitation.patientName, quiz_title:quiz.title, summary:savedResponse.summary || null });
        const progressRecord = records.find(record => isEmailQuizProgressRecord(record) && normalizeStoredProgress(record).invitationId === invitation.id);
        const savedProgress = progressRecord ? normalizeStoredProgress(progressRecord) : null;
        return json(res, 200, { state: 'ready', patient_name: invitation.patientName, quiz_title: quiz.title, quiz, expires_at: new Date(invitation.expiresAt).toISOString(), progress: savedProgress ? { totalQuestions:savedProgress.totalQuestions, answeredQuestions:savedProgress.answeredQuestions, updatedAt:savedProgress.updatedAt } : null });
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
      return json(res, 200, { success:true, responses, updatedAt:new Date().toISOString() });
    }

    if (action === 'report') {
      const sessionToken = String(body.sessionToken || '');
      const startDate = String(body.startDate || '');
      const endDate = String(body.endDate || '');
      if (!sessionToken || !validDateKey(startDate) || !validDateKey(endDate) || startDate > endDate) return json(res, 400, { success:false, message:'Informe um período válido para consultar os envios.' });
      const windowDays = Math.ceil((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000) + 1;
      if (windowDays > 90) return json(res, 400, { success:false, message:'O período máximo para consulta é de 90 dias.' });
      await requireAdmin(sessionToken);
      const events = await getBrevoQuestionnaireEvents(startDate, endDate);
      return json(res, 200, { success:true, channel:'email', events, updatedAt:new Date().toISOString() });
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
