import questionnaireEmailHandler from './questionnaire-email.js';

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).json({ success:false, message:'Método não permitido.' });
  const body = req.method === 'GET' ? req.query : (req.body && typeof req.body === 'object' ? req.body : {});
  req.body = { ...body, action:'worker' };
  req.method = 'POST'; // Mock POST to bypass questionnaireEmailHandler method check
  return questionnaireEmailHandler(req, res);
}
