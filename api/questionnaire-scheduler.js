import questionnaireEmailHandler from './questionnaire-email.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success:false, message:'Método não permitido.' });
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  req.body = { ...body, action:'worker' };
  return questionnaireEmailHandler(req, res);
}
