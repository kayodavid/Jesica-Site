import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const SUPABASE_URL = 'https://mcsilxhgwbxtvydytjcx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_PKWZS9Za2vfbGCvKNcquow_zuymCA72';
const QUESTIONNAIRE_BASE_URL = 'https://jessicamelonutri.com.br/responder-questionario';
const QUIZ_DELIMITER = '\n---QUIZ---\n';
const QUESTION_DELIMITER = '\n---QUESTION---\n';
const QUESTION_THEME = '__patient_question__';
const EMAIL_QUIZ_INVITATION_THEME = '__email_quiz_invitation__';
const EMAIL_QUIZ_RESPONSE_THEME = '__email_quiz_response__';
const EMAIL_QUIZ_SCHEDULE_THEME = '__email_quiz_schedule__';

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
    channel: 'email'
  };
}

function safeStoredAnswer(answer) {
  const value = cleanAnswer(answer?.value);
  const isImage = /^data:image\//i.test(value);
  return {
    questionId: usableText(answer?.questionId),
    questionCode: usableText(answer?.questionCode),
    questionTitle: usableText(answer?.questionTitle) || 'Pergunta',
    type: usableText(answer?.type) || 'single',
    label: usableText(answer?.label),
    score: Number.isFinite(Number(answer?.score)) ? Number(answer.score) : 0,
    value: isImage ? '[Imagem enviada pelo paciente]' : value
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
      expiresAt: new Date(invitation.expiresAt).toISOString()
    }
  });
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
  const responsesByInvitation = new Map(responses.map(item => [item.invitationId, item]));
  const rows = invitations.map(invitation => {
    const response = responsesByInvitation.get(invitation.invitationId);
    const isExpired = invitation.expiresAt && Date.parse(invitation.expiresAt) < Date.now();
    return {
      id: invitation.invitationId,
      patientKey: invitation.patientKey,
      patientName: invitation.patientName,
      recipientEmail: invitation.recipientEmail,
      quizId: invitation.quizId,
      quizTitle: invitation.quizTitle,
      sentAt: invitation.sentAt,
      respondedAt: response?.respondedAt || '',
      status: response ? 'responded' : (isExpired ? 'lost' : 'open'),
      answers: response?.answers || [],
      summary: response?.summary || {},
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
      status: 'responded',
      answers: response.answers,
      summary: response.summary,
      channel: 'email'
    });
  });
  return rows.filter(item => {
    const date = String(item.sentAt || item.respondedAt || '').slice(0, 10);
    return date && date >= startDate && date <= endDate;
  }).sort((a, b) => new Date(b.respondedAt || b.sentAt || 0) - new Date(a.respondedAt || a.sentAt || 0));
}

async function sendQuestionnaireEmail({ recipientEmail, patientName, quiz, accessToken, expiresAt, scheduledAt }) {
  const questionnaireUrl = `${QUESTIONNAIRE_BASE_URL}?token=${encodeURIComponent(accessToken)}`;
  const deadline = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone: 'America/Sao_Paulo' }).format(new Date(expiresAt));
  const firstName = String(patientName || '').trim().split(/\s+/)[0] || 'Olá';
  const htmlContent = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#faf8f3;font-family:Arial,Helvetica,sans-serif;color:#3d3226;line-height:1.6"><div style="max-width:600px;margin:0 auto;padding:32px 18px"><div style="background:#ffffff;border:1px solid #eadfca;border-radius:18px;overflow:hidden;box-shadow:0 8px 24px rgba(61,50,38,.08)"><div style="background:#a88b36;color:#fff;padding:25px 28px"><p style="margin:0 0 5px;font-size:12px;letter-spacing:.11em;text-transform:uppercase;opacity:.88">Jessica Melo Nutricionista</p><h1 style="margin:0;font-size:24px;line-height:1.25">Novo questionário disponível</h1></div><div style="padding:28px"><p style="margin-top:0">Olá, <strong>${escapeHtml(firstName)}</strong>!</p><p>A Dra. Jessica preparou o questionário <strong>${escapeHtml(quiz.title)}</strong> para acompanhar o seu cuidado nutricional.</p><p>Reserve alguns minutos para responder. Suas respostas serão enviadas de forma segura para o acompanhamento profissional.</p><p style="margin:28px 0"><a href="${questionnaireUrl}" style="display:inline-block;background:#a88b36;border-radius:10px;color:#ffffff;padding:13px 20px;text-decoration:none;font-weight:700">Responder questionário</a></p><p style="font-size:13px;color:#6d6255;margin-bottom:0">Este convite é individual e fica disponível até <strong>${escapeHtml(deadline)}</strong>.</p></div></div><p style="font-size:12px;color:#827766;text-align:center;margin:18px 0 0">© 2026 Jessica Melo Nutricionista. Todos os direitos reservados.</p></div></body></html>`;
  return sendBrevoEmail({
    to: { email: recipientEmail, name: patientName },
    subject: `Questionário disponível — ${quiz.title}`,
    htmlContent,
    scheduledAt,
    replyTo: { email: process.env.BREVO_REPLY_TO_EMAIL || 'contato@jessicamelonutri.com.br', name: 'Jessica Melo Nutricionista' }
  });
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

function normalizeStoredSchedule(record) {
  const data = parseStoredRecord(record);
  return {
    id: usableText(data.scheduleId) || String(record?.id || ''),
    recordId: String(record?.id || ''),
    scheduleKey: usableText(data.scheduleKey),
    patientKey: usableText(data.patientKey),
    patientName: usableText(data.patientName) || 'Paciente',
    recipientEmail: usableText(data.recipientEmail).toLowerCase(),
    quizLinkId: usableText(data.quizLinkId),
    quizId: usableText(data.quizId),
    quizTitle: usableText(data.quizTitle) || 'Questionário',
    scheduledFor: usableText(data.scheduledFor),
    expiresAt: usableText(data.expiresAt),
    provider: usableText(data.provider) || 'brevo',
    providerMessageId: usableText(data.providerMessageId),
    providerStatus: usableText(data.providerStatus),
    status: usableText(data.status) || 'scheduled',
    errorMessage: usableText(data.errorMessage),
    cancelledAt: usableText(data.cancelledAt),
    createdAt: usableText(data.createdAt) || record?.createdAt || record?.created_at || '',
    updatedAt: usableText(data.updatedAt) || record?.updatedAt || record?.updated_at || ''
  };
}

async function listStoredSchedules(sessionToken, patientKey = '', quizLinkId = '') {
  const records = await listStoredQuestionnaireRecords(sessionToken);
  return records.filter(isEmailQuizScheduleRecord).map(normalizeStoredSchedule).filter(item => {
    return (!patientKey || item.patientKey === patientKey) && (!quizLinkId || item.quizLinkId === quizLinkId);
  });
}

async function upsertStoredSchedule(sessionToken, schedule) {
  const data = {
    ...schedule,
    scheduleId: usableText(schedule.scheduleId || schedule.id) || randomBytes(12).toString('hex'),
    provider: 'brevo',
    updatedAt: new Date().toISOString()
  };
  data.id = data.scheduleId;
  const records = await listStoredQuestionnaireRecords(sessionToken);
  const source = `email-quiz-schedule://${data.scheduleId}`;
  const payload = {
    p_token: sessionToken,
    p_title: `Agendamento — ${data.quizTitle || 'Questionário'} — ${data.patientName || data.recipientEmail}`,
    p_theme: EMAIL_QUIZ_SCHEDULE_THEME,
    p_description: JSON.stringify(data),
    p_url: `https://jessicamelonutri.com.br/${source}`,
    p_provider: 'youtube',
    p_embed_url: source,
    p_thumbnail_url: ''
  };
  const current = records.find(record => recordSource(record) === source);
  const result = current ? await callRpc('app_update_video', { ...payload, p_id: current.id }) : await callRpc('app_add_video', payload);
  return { ...data, recordId: String(current?.id || result?.id || result?.video?.id || '') };
}

async function getBrevoEmailStatus(messageId) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey || !messageId) return {};
  const response = await fetch(`https://api.brevo.com/v3/smtp/emailStatus/${encodeURIComponent(messageId)}`, {
    headers: { 'api-key': apiKey, Accept: 'application/json' }
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch {}
  if (!response.ok) throw new Error(`Brevo ${response.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  return data || {};
}

async function cancelBrevoEmail(messageId) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey || !messageId) return {};
  const response = await fetch(`https://api.brevo.com/v3/smtp/email/${encodeURIComponent(messageId)}`, {
    method: 'DELETE',
    headers: { 'api-key': apiKey, Accept: 'application/json' }
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch {}
  if (!response.ok) throw new Error(`Brevo ${response.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  return data || {};
}

function scheduleStatusFromProvider(status, fallback = 'scheduled') {
  const value = String(status || '').toLowerCase();
  if (['cancelled', 'canceled'].includes(value)) return 'cancelled';
  if (['delivered', 'sent', 'processed', 'accepted'].includes(value)) return 'sent';
  if (['error', 'failed', 'soft_bounce', 'hard_bounce', 'blocked', 'invalid_email'].includes(value)) return 'failed';
  if (['queued', 'scheduled', 'pending', 'request'].includes(value)) return 'scheduled';
  return fallback;
}

async function listSchedulesWithProviderStatus(sessionToken, patientKey = '', quizLinkId = '') {
  const schedules = await listStoredSchedules(sessionToken, patientKey, quizLinkId);
  return Promise.all(schedules.map(async schedule => {
    if (!schedule.providerMessageId || !['scheduled', 'queued', 'pending'].includes(String(schedule.status).toLowerCase())) return schedule;
    try {
      const provider = await getBrevoEmailStatus(schedule.providerMessageId);
      const providerStatus = usableText(provider.status || provider.messageStatus || provider.event);
      return { ...schedule, providerStatus, status: scheduleStatusFromProvider(providerStatus, schedule.status) };
    } catch (error) {
      console.error('Brevo schedule status error:', error.message);
      return schedule;
    }
  })).then(items => items.sort((a, b) => new Date(a.scheduledFor || 0) - new Date(b.scheduledFor || 0)));
}


function localDateTimeToIso(date, time) {
  const dateKey = String(date || '').trim();
  const timeKey = String(time || '').trim();
  if (!validDateKey(dateKey) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(timeKey)) throw new Error('Informe uma data e um horário válidos para o envio.');
  const timestamp = Date.parse(`${dateKey}T${timeKey}:00-03:00`);
  if (!Number.isFinite(timestamp)) throw new Error('Informe uma data e um horário válidos para o envio.');
  return new Date(timestamp).toISOString();
}

function validateScheduledAt(value) {
  const timestamp = Date.parse(String(value || ''));
  if (!Number.isFinite(timestamp)) throw new Error('Informe uma data e um horário válidos para o envio.');
  if (timestamp <= Date.now() + 30_000) throw new Error('O horário agendado precisa estar no futuro.');
  if (timestamp > Date.now() + (72 * 60 * 60 * 1000)) throw new Error('A Brevo aceita agendamentos de e-mail com até 72 horas de antecedência.');
  return new Date(timestamp).toISOString();
}

function responseDeadline(scheduledAt, amount, unit) {
  const numericAmount = Math.max(1, Math.min(Number(amount || 2), 60));
  const multiplier = unit === 'hours' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  return new Date(Date.parse(scheduledAt) + (numericAmount * multiplier)).toISOString();
}

async function createBrevoScheduledQuestionnaire({ sessionToken, patientKey, patientName, recipientEmail, quizLinkId, quiz, scheduledAt, expiresAt, scheduleKey }) {
  const existing = (await listStoredSchedules(sessionToken, patientKey, quizLinkId)).find(item => item.scheduleKey === scheduleKey && item.status !== 'cancelled');
  if (existing?.providerMessageId) return { schedule: existing, duplicate: true };

  const scheduleId = randomBytes(12).toString('hex');
  const invitation = {
    version: 2,
    id: randomBytes(12).toString('hex'),
    sessionToken,
    patientKey,
    patientName,
    recipientEmail,
    quizId: quiz.id,
    quizTitle: quiz.title,
    quizLinkId: quizLinkId || '',
    sentAt: scheduledAt,
    expiresAt: Date.parse(expiresAt)
  };
  const accessToken = encryptInvitation(invitation);
  const brevoResult = await sendQuestionnaireEmail({ recipientEmail, patientName, quiz, accessToken, expiresAt: invitation.expiresAt, scheduledAt });
  const providerMessageId = usableText(brevoResult.messageId);
  if (!providerMessageId) throw new Error('A Brevo não retornou o identificador do agendamento.');

  const now = new Date().toISOString();
  let schedule;
  try {
    schedule = await upsertStoredSchedule(sessionToken, {
      scheduleId,
      scheduleKey,
      patientKey,
      patientName,
      recipientEmail,
      quizLinkId: quizLinkId || '',
      quizId: quiz.id,
      quizTitle: quiz.title,
      scheduledFor: scheduledAt,
      expiresAt: new Date(expiresAt).toISOString(),
      providerMessageId,
      providerStatus: 'scheduled',
      status: 'scheduled',
      createdAt: now,
      updatedAt: now
    });
  } catch (error) {
    try { await cancelBrevoEmail(providerMessageId); } catch (cancelError) { console.error('Brevo compensation cancellation error:', cancelError.message); }
    throw error;
  }
  try { await storeInvitation(invitation, quiz); } catch (error) { console.error('Scheduled invitation history error:', error.message); }
  return { schedule, duplicate: false };
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
      const brevoResult = await sendQuestionnaireEmail({ recipientEmail, patientName, quiz, accessToken, expiresAt });
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
      const entries = Array.isArray(body.entries) ? body.entries.slice(0, 32) : [];
      if (!sessionToken || !patientKey || !validEmail(recipientEmail) || !quizId || !entries.length) return json(res, 400, { success:false, message:'Não foi possível preparar o agendamento. Confira o paciente, o e-mail, o questionário e as datas.' });
      await requireAdmin(sessionToken);
      const quiz = await loadQuiz(sessionToken, quizId);
      const schedules = [];
      const failed = [];
      for (const entry of entries) {
        try {
          const scheduledAt = validateScheduledAt(entry.scheduledAt || localDateTimeToIso(entry.date, entry.time));
          const expiresAt = responseDeadline(scheduledAt, entry.responseAmount, entry.responseUnit);
          const scheduleKey = String(entry.scheduleKey || (quizLinkId || quiz.id) + ':' + scheduledAt);
          const result = await createBrevoScheduledQuestionnaire({ sessionToken, patientKey, patientName, recipientEmail, quizLinkId, quiz, scheduledAt, expiresAt, scheduleKey });
          schedules.push({ ...result.schedule, duplicate: result.duplicate });
        } catch (error) {
          failed.push({ scheduledAt: entry.scheduledAt || '', message: error.message || 'Não foi possível cadastrar este envio.' });
        }
      }
      if (!schedules.length && failed.length) return json(res, 502, { success:false, message:failed[0].message, schedules, failed });
      return json(res, 200, { success:true, schedules, failed, message:failed.length ? 'Alguns envios foram cadastrados e outros precisam de revisão.' : 'Envios cadastrados na Brevo.' });
    }

    if (action === 'list-schedules') {
      const sessionToken = String(body.sessionToken || '');
      if (!sessionToken) return json(res, 400, { success:false, message:'Sessão administrativa não encontrada.' });
      await requireAdmin(sessionToken);
      const schedules = await listSchedulesWithProviderStatus(sessionToken, String(body.patientKey || '').trim(), String(body.quizLinkId || '').trim());
      return json(res, 200, { success:true, schedules, updatedAt:new Date().toISOString() });
    }

    if (action === 'cancel-schedule') {
      const sessionToken = String(body.sessionToken || '');
      const scheduleId = String(body.scheduleId || '').trim();
      if (!sessionToken || !scheduleId) return json(res, 400, { success:false, message:'Agendamento não identificado.' });
      await requireAdmin(sessionToken);
      const schedule = (await listStoredSchedules(sessionToken)).find(item => item.id === scheduleId || item.recordId === scheduleId);
      if (!schedule) return json(res, 404, { success:false, message:'Agendamento não encontrado.' });
      if (schedule.providerMessageId && !['cancelled', 'sent', 'failed'].includes(schedule.status)) await cancelBrevoEmail(schedule.providerMessageId);
      const updated = await upsertStoredSchedule(sessionToken, { ...schedule, status:'cancelled', providerStatus:'cancelled', cancelledAt:new Date().toISOString() });
      return json(res, 200, { success:true, schedule:updated });
    }

    if (action === 'reschedule-schedule') {
      const sessionToken = String(body.sessionToken || '');
      const scheduleId = String(body.scheduleId || '').trim();
      const scheduledAt = validateScheduledAt(body.scheduledAt || localDateTimeToIso(body.date, body.time));
      if (!sessionToken || !scheduleId) return json(res, 400, { success:false, message:'Agendamento não identificado.' });
      await requireAdmin(sessionToken);
      const previous = (await listStoredSchedules(sessionToken)).find(item => item.id === scheduleId || item.recordId === scheduleId);
      if (!previous) return json(res, 404, { success:false, message:'Agendamento não encontrado.' });
      if (previous.providerMessageId && !['cancelled', 'sent', 'failed'].includes(previous.status)) await cancelBrevoEmail(previous.providerMessageId);
      await upsertStoredSchedule(sessionToken, { ...previous, status:'cancelled', providerStatus:'cancelled', cancelledAt:new Date().toISOString() });
      const quiz = await loadQuiz(sessionToken, previous.quizId);
      const expiresAt = responseDeadline(scheduledAt, body.responseAmount, body.responseUnit);
      const result = await createBrevoScheduledQuestionnaire({ sessionToken, patientKey:previous.patientKey, patientName:previous.patientName, recipientEmail:previous.recipientEmail, quizLinkId:previous.quizLinkId, quiz, scheduledAt, expiresAt, scheduleKey:(previous.quizLinkId || previous.quizId) + ':' + scheduledAt });
      return json(res, 200, { success:true, previousScheduleId:previous.id, schedule:result.schedule });
    }

    if (action === 'get') {
      try {
        const invitation = decryptInvitation(String(body.token || ''));
        const quiz = await loadQuiz(invitation.sessionToken, invitation.quizId);
        return json(res, 200, { state: 'ready', patient_name: invitation.patientName, quiz_title: quiz.title, quiz, expires_at: new Date(invitation.expiresAt).toISOString() });
      } catch (error) {
        return json(res, 200, { state: /expirado/i.test(error.message) ? 'expired' : 'invalid' });
      }
    }

    if (action === 'submit') {
      let invitation;
      try { invitation = decryptInvitation(String(body.token || '')); } catch (error) { return json(res, 200, { success: false, reason: /expirado/i.test(error.message) ? 'expired' : 'invalid' }); }
      const answers = Array.isArray(body.answers) ? body.answers : [];
      if (!answers.length || answers.length > 100) return json(res, 400, { success: false, message: 'As respostas informadas são inválidas.' });
      const quiz = await loadQuiz(invitation.sessionToken, invitation.quizId);
      const saved = await storeResponse(invitation, quiz, answers, body.responseSummary || {});
      if (!saved) return json(res, 200, { success: false, reason: 'already_answered' });
      try { await sendResponseReceipt({ invitation, quiz, answers, summary: body.responseSummary || {} }); } catch (error) { console.error('Questionnaire response receipt error:', error.message); }
      return json(res, 200, { success: true, quiz_title: quiz.title });
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
