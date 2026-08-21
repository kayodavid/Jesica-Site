import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const SUPABASE_URL = 'https://mcsilxhgwbxtvydytjcx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_PKWZS9Za2vfbGCvKNcquow_zuymCA72';
const QUESTIONNAIRE_BASE_URL = 'https://jessicamelonutri.com.br/responder-questionario';
const QUIZ_DELIMITER = '\n---QUIZ---\n';

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

async function loadQuiz(sessionToken, quizId) {
  const records = await callRpc('app_list_videos', { p_token: sessionToken });
  const rawQuiz = (Array.isArray(records) ? records : []).find(item => String(item?.id || '') === String(quizId || ''));
  const quiz = normalizeQuiz(rawQuiz);
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

async function sendBrevoEmail({ to, subject, htmlContent, replyTo }) {
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
      htmlContent
    })
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch {}
  if (!response.ok) throw new Error(`Brevo ${response.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  return data || {};
}

async function sendQuestionnaireEmail({ recipientEmail, patientName, quiz, accessToken, expiresAt }) {
  const questionnaireUrl = `${QUESTIONNAIRE_BASE_URL}?token=${encodeURIComponent(accessToken)}`;
  const deadline = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone: 'America/Sao_Paulo' }).format(new Date(expiresAt));
  const firstName = String(patientName || '').trim().split(/\s+/)[0] || 'Olá';
  const htmlContent = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#faf8f3;font-family:Arial,Helvetica,sans-serif;color:#3d3226;line-height:1.6"><div style="max-width:600px;margin:0 auto;padding:32px 18px"><div style="background:#ffffff;border:1px solid #eadfca;border-radius:18px;overflow:hidden;box-shadow:0 8px 24px rgba(61,50,38,.08)"><div style="background:#a88b36;color:#fff;padding:25px 28px"><p style="margin:0 0 5px;font-size:12px;letter-spacing:.11em;text-transform:uppercase;opacity:.88">Jessica Melo Nutricionista</p><h1 style="margin:0;font-size:24px;line-height:1.25">Novo questionário disponível</h1></div><div style="padding:28px"><p style="margin-top:0">Olá, <strong>${escapeHtml(firstName)}</strong>!</p><p>A Dra. Jessica preparou o questionário <strong>${escapeHtml(quiz.title)}</strong> para acompanhar o seu cuidado nutricional.</p><p>Reserve alguns minutos para responder. Suas respostas serão enviadas de forma segura para o acompanhamento profissional.</p><p style="margin:28px 0"><a href="${questionnaireUrl}" style="display:inline-block;background:#a88b36;border-radius:10px;color:#ffffff;padding:13px 20px;text-decoration:none;font-weight:700">Responder questionário</a></p><p style="font-size:13px;color:#6d6255;margin-bottom:0">Este convite é individual e fica disponível até <strong>${escapeHtml(deadline)}</strong>.</p></div></div><p style="font-size:12px;color:#827766;text-align:center;margin:18px 0 0">© 2026 Jessica Melo Nutricionista. Todos os direitos reservados.</p></div></body></html>`;
  return sendBrevoEmail({
    to: { email: recipientEmail, name: patientName },
    subject: `Questionário disponível — ${quiz.title}`,
    htmlContent,
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
      const accessToken = encryptInvitation({ version: 1, id: randomBytes(12).toString('hex'), sessionToken, patientKey, patientName, recipientEmail, quizId: quiz.id, expiresAt });
      const brevoResult = await sendQuestionnaireEmail({ recipientEmail, patientName, quiz, accessToken, expiresAt });
      return json(res, 200, { success: true, message: 'Questionário enviado por e-mail.', expiresAt: new Date(expiresAt).toISOString(), providerMessageId: brevoResult.messageId || null });
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
      await sendResponseReceipt({ invitation, quiz, answers, summary: body.responseSummary || {} });
      return json(res, 200, { success: true, quiz_title: quiz.title });
    }

    if (action === 'list') return json(res, 200, { success: true, invitations: [] });
    return json(res, 400, { success: false, message: 'Ação inválida.' });
  } catch (error) {
    console.error('Questionnaire email error:', error.message);
    const message = /expirado/i.test(error.message) ? 'Este convite expirou. Solicite um novo questionário.' : 'Não foi possível processar o questionário por e-mail. Tente novamente em alguns minutos.';
    return json(res, 500, { success: false, message });
  }
}
