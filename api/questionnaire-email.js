const SUPABASE_URL = 'https://mcsilxhgwbxtvydytjcx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_PKWZS9Za2vfbGCvKNcquow_zuymCA72';
const QUESTIONNAIRE_BASE_URL = 'https://jessicamelonutri.com.br/responder-questionario';

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

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function cleanQuestion(question = {}) {
  return {
    id: String(question.id || ''),
    code: String(question.code || ''),
    title: String(question.title || ''),
    questionText: String(question.questionText || ''),
    questionHtml: String(question.questionHtml || ''),
    questionImage: String(question.questionImage || ''),
    type: String(question.type || 'single'),
    icon: String(question.icon || '○'),
    label: String(question.label || ''),
    options: Array.isArray(question.options) ? question.options.map(option => String(option || '')).filter(Boolean) : [],
    optionSettings: Array.isArray(question.optionSettings) ? question.optionSettings : [],
    scaleConfig: question.scaleConfig && typeof question.scaleConfig === 'object' ? question.scaleConfig : null,
    metricUnit: String(question.metricUnit || ''),
    openResponseTitle: String(question.openResponseTitle || ''),
    numericOnly: question.numericOnly === true,
    required: question.required !== false
  };
}

function cleanQuizSnapshot(value = {}) {
  const questions = Array.isArray(value.questionSnapshots) ? value.questionSnapshots.map(cleanQuestion).filter(question => question.id || question.questionText) : [];
  if (!String(value.id || '').trim() || !String(value.title || '').trim() || !questions.length) return null;
  return {
    id: String(value.id),
    title: String(value.title).trim(),
    description: String(value.description || '').trim(),
    coverText: String(value.coverText || '').trim(),
    coverImage: String(value.coverImage || '').trim(),
    contextBlocks: Array.isArray(value.contextBlocks) ? value.contextBlocks.slice(0, 30) : [],
    questionSettings: value.questionSettings && typeof value.questionSettings === 'object' ? value.questionSettings : {},
    questionSnapshots: questions,
    scoreVisible: value.scoreVisible !== false,
    sentAt: new Date().toISOString()
  };
}

async function sendBrevoQuestionnaireEmail({ email, patientName, quizTitle, accessToken, expiresAt }) {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL || 'contato@jessicamelonutri.com.br';
  const senderName = process.env.BREVO_SENDER_NAME || 'Jessica Melo Nutricionista';
  if (!apiKey) throw new Error('BREVO_API_KEY not configured');

  const questionnaireUrl = `${QUESTIONNAIRE_BASE_URL}?token=${encodeURIComponent(accessToken)}`;
  const deadline = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone: 'America/Sao_Paulo' }).format(new Date(expiresAt));
  const firstName = String(patientName || '').trim().split(/\s+/)[0] || 'Olá';
  const safeName = escapeHtml(firstName);
  const safeTitle = escapeHtml(quizTitle);
  const htmlContent = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#faf8f3;font-family:Arial,Helvetica,sans-serif;color:#3d3226;line-height:1.6"><div style="max-width:600px;margin:0 auto;padding:32px 18px"><div style="background:#ffffff;border:1px solid #eadfca;border-radius:18px;overflow:hidden;box-shadow:0 8px 24px rgba(61,50,38,.08)"><div style="background:#a88b36;color:#fff;padding:25px 28px"><p style="margin:0 0 5px;font-size:12px;letter-spacing:.11em;text-transform:uppercase;opacity:.88">Jessica Melo Nutricionista</p><h1 style="margin:0;font-size:24px;line-height:1.25">Novo questionário disponível</h1></div><div style="padding:28px"><p style="margin-top:0">Olá, <strong>${safeName}</strong>!</p><p>A Dra. Jessica preparou o questionário <strong>${safeTitle}</strong> para acompanhar o seu cuidado nutricional.</p><p>Reserve alguns minutos para responder. Suas respostas serão enviadas de forma segura e ficarão disponíveis apenas para o acompanhamento profissional.</p><p style="margin:28px 0"><a href="${questionnaireUrl}" style="display:inline-block;background:#a88b36;border-radius:10px;color:#ffffff;padding:13px 20px;text-decoration:none;font-weight:700">Responder questionário</a></p><p style="font-size:13px;color:#6d6255;margin-bottom:0">Este convite é individual e pode ser usado uma única vez. Ele fica disponível até <strong>${escapeHtml(deadline)}</strong>.</p></div></div><p style="font-size:12px;color:#827766;text-align:center;margin:18px 0 0">© 2026 Jessica Melo Nutricionista. Todos os direitos reservados.</p></div></body></html>`;

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      sender: { email: senderEmail, name: senderName },
      to: [{ email, name: patientName || undefined }],
      subject: `Questionário disponível — ${quizTitle}`,
      htmlContent
    })
  });
  const text = await response.text();
  let value = text;
  try { value = text ? JSON.parse(text) : {}; } catch {}
  if (!response.ok) throw new Error(`Brevo ${response.status}: ${typeof value === 'string' ? value : JSON.stringify(value)}`);
  return value || {};
}

function requestBody(req) {
  if (req.method === 'GET') return req.query || {};
  return req.body || {};
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return json(res, 405, { success: false, message: 'Método não permitido.' });
  const body = requestBody(req);
  const action = String(body.action || '').trim();

  try {
    if (action === 'send') {
      if (req.method !== 'POST') return json(res, 405, { success: false, message: 'Método não permitido.' });
      const sessionToken = String(body.sessionToken || '');
      const patientKey = String(body.patientKey || '').trim();
      const patientName = String(body.patientName || '').trim();
      const recipientEmail = String(body.recipientEmail || '').trim().toLowerCase();
      const quizLinkId = String(body.quizLinkId || '').trim();
      const quiz = cleanQuizSnapshot(body.quiz || {});
      const expiresInDays = Math.max(1, Math.min(Number(body.expiresInDays || 14), 60));
      if (!sessionToken || !patientKey || !validEmail(recipientEmail) || !quiz) {
        return json(res, 400, { success: false, message: 'Não foi possível preparar o convite. Confira o paciente, o e-mail e o questionário.' });
      }

      const invitation = await callRpc('app_email_quiz_create_invitation', {
        p_token: sessionToken,
        p_patient_key: patientKey,
        p_patient_name: patientName,
        p_recipient_email: recipientEmail,
        p_quiz_link_id: quizLinkId,
        p_quiz_id: quiz.id,
        p_quiz_title: quiz.title,
        p_quiz_snapshot: quiz,
        p_expires_in_days: expiresInDays
      });
      const data = Array.isArray(invitation) ? invitation[0] : invitation;
      try {
        const brevoResult = await sendBrevoQuestionnaireEmail({
          email: recipientEmail,
          patientName,
          quizTitle: quiz.title,
          accessToken: data.access_token,
          expiresAt: data.expires_at
        });
        await callRpc('app_email_quiz_mark_sent', {
          p_token: sessionToken,
          p_invitation_id: data.invitation_id,
          p_provider_message_id: brevoResult.messageId || brevoResult.message_id || null
        });
      } catch (emailError) {
        try {
          await callRpc('app_email_quiz_mark_send_failed', {
            p_token: sessionToken,
            p_invitation_id: data.invitation_id,
            p_error_message: emailError.message
          });
        } catch {}
        throw emailError;
      }
      return json(res, 200, { success: true, message: 'Questionário enviado por e-mail.', invitationId: data.invitation_id, expiresAt: data.expires_at });
    }

    if (action === 'list') {
      const sessionToken = String(body.sessionToken || '');
      if (!sessionToken) return json(res, 401, { success: false, message: 'Sessão inválida.' });
      const invitations = await callRpc('app_email_quiz_list', {
        p_token: sessionToken,
        p_patient_key: String(body.patientKey || '').trim() || null
      });
      return json(res, 200, { success: true, invitations: Array.isArray(invitations) ? invitations : (invitations || []) });
    }

    if (action === 'get') {
      const invitation = await callRpc('app_email_quiz_get_public_invitation', { p_access_token: String(body.token || '') });
      return json(res, 200, Array.isArray(invitation) ? invitation[0] : invitation);
    }

    if (action === 'submit') {
      if (req.method !== 'POST') return json(res, 405, { success: false, message: 'Método não permitido.' });
      const answers = Array.isArray(body.answers) ? body.answers : null;
      if (!answers || answers.length > 100) return json(res, 400, { success: false, message: 'As respostas informadas são inválidas.' });
      const result = await callRpc('app_email_quiz_submit_response', {
        p_access_token: String(body.token || ''),
        p_answers: answers,
        p_response_summary: body.responseSummary && typeof body.responseSummary === 'object' ? body.responseSummary : {}
      });
      return json(res, 200, Array.isArray(result) ? result[0] : result);
    }

    return json(res, 400, { success: false, message: 'Ação inválida.' });
  } catch (error) {
    console.error('Questionnaire email error:', error.message);
    return json(res, 500, { success: false, message: 'Não foi possível processar o questionário por e-mail. Tente novamente em alguns minutos.' });
  }
}
