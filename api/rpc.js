const SUPABASE_URL = 'https://mcsilxhgwbxtvydytjcx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_PKWZS9Za2vfbGCvKNcquow_zuymCA72';

const allowed = new Set([
  'app_login', 'app_current_user', 'app_logout', 'app_change_password',
  'app_list_patients', 'app_add_patient', 'app_reset_patient_password',
  'app_delete_patient', 'app_list_videos', 'app_add_video', 'app_update_video',
  'app_delete_video', 'app_list_ebooks', 'app_add_ebook', 'app_update_ebook',
  'app_delete_ebook', 'app_list_blogs', 'app_add_blog', 'app_update_blog', 'app_delete_blog', 'app_get_calendar', 'app_save_calendar'
]);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { name, body } = req.body || {};
  if (!allowed.has(name)) return res.status(400).json({ error: 'RPC not allowed' });
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body || {})
    });
    const text = await response.text();
    res.status(response.status);
    res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json');
    return res.send(text);
  } catch (error) {
    return res.status(502).json({ error: 'Supabase unavailable', detail: error.message });
  }
}
