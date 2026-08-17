const SUPABASE_URL = 'https://mcsilxhgwbxtvydytcx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_PKWZS9Za2vfbGCvKNcquow_zuymCA72';
const DB_KEY_SESSION = 'jessicamelo_session';
const DB_KEY_USERS = 'jessicamelo_users';
const DB_KEY_CALENDARS = 'jessicamelo_calendars';
const DB_KEY_VIDEOS = 'jessicamelo_videos';
const DB_KEY_EBOOKS = 'jessicamelo_ebooks';

async function rpc(name, body = {}) {
  const request = (url) => fetch(url, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  let response;
  try { response = await request(`${SUPABASE_URL}/rest/v1/rpc/${name}`); } catch {}
  if (!response || !response.ok) {
    response = await fetch('/api/rpc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, body }) });
  }
  if (!response.ok) throw new Error(await response.text());
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function token() { return localStorage.getItem('jessicamelo_token') || ''; }
function saveSession(session) { localStorage.setItem(DB_KEY_SESSION, JSON.stringify(session)); if (session.token) localStorage.setItem('jessicamelo_token', session.token); }
function currentSession() { const raw = localStorage.getItem(DB_KEY_SESSION); return raw ? JSON.parse(raw) : null; }
function normalizeVideo(video) { if (!video) return video; return { ...video, embedUrl: video.embedUrl || video.embed_url || '', thumbnailUrl: video.thumbnailUrl || video.thumbnail_url || '', createdAt: video.createdAt || video.created_at, updatedAt: video.updatedAt || video.updated_at, published: video.published !== false }; }
function normalizeEbook(book) { if (!book) return book; return { ...book, embedUrl: book.embedUrl || book.embed_url || '', thumbnailUrl: book.thumbnailUrl || book.thumbnail_url || '', createdAt: book.createdAt || book.created_at, updatedAt: book.updatedAt || book.updated_at, published: book.published !== false }; }

function parseGoogleDriveId(url) {
  try {
    const parsed = new URL(url.trim());
    if (!parsed.hostname.endsWith('drive.google.com') && !parsed.hostname.endsWith('docs.google.com')) return '';
    const match = parsed.pathname.match(/\/d\/([^/]+)/);
    return match?.[1] || parsed.searchParams.get('id') || '';
  } catch { return ''; }
}

function parseVideoUrl(url) {
  const value = url.trim(); let provider = '', embedUrl = '', thumbnailUrl = '';
  try {
    const parsed = new URL(value);
    if (parsed.hostname.includes('youtube.com') || parsed.hostname === 'youtu.be') {
      const id = parsed.hostname === 'youtu.be' ? parsed.pathname.slice(1) : parsed.searchParams.get('v') || parsed.pathname.split('/').filter(Boolean).pop();
      if (!id) return { error: 'Não foi possível identificar o vídeo do YouTube.' };
      provider = 'youtube'; embedUrl = `https://www.youtube.com/embed/${id}`; thumbnailUrl = `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
    } else if (parsed.hostname.includes('vimeo.com')) {
      const id = parsed.pathname.split('/').filter(Boolean).pop();
      if (!id || !/^\d+$/.test(id)) return { error: 'Não foi possível identificar o vídeo do Vimeo.' };
      provider = 'vimeo'; embedUrl = `https://player.vimeo.com/video/${id}`; thumbnailUrl = `https://vumbnail.com/${id}.jpg`;
    } else if (parsed.hostname.endsWith('drive.google.com')) {
      const id = parseGoogleDriveId(value);
      if (!id) return { error: 'Não foi possível identificar o arquivo do Google Drive.' };
      provider = 'google_drive'; embedUrl = `https://drive.google.com/file/d/${id}/preview`; thumbnailUrl = `https://drive.google.com/thumbnail?id=${id}&sz=w1200`;
    } else return { error: 'Use um link do YouTube, Vimeo ou Google Drive.' };
  } catch { return { error: 'Informe uma URL válida do YouTube, Vimeo ou Google Drive.' }; }
  return { value, provider, embedUrl, thumbnailUrl };
}

function parseEbookUrl(url) {
  const value = url.trim(); const id = parseGoogleDriveId(value);
  if (!id) return { error: 'Use um link válido de arquivo do Google Drive.' };
  return { value, provider: 'google_drive', embedUrl: `https://drive.google.com/file/d/${id}/preview`, thumbnailUrl: `https://drive.google.com/thumbnail?id=${id}&sz=w1200` };
}

export function getPatientTheme() { return localStorage.getItem('jessicamelo_patient_theme') || 'black'; }
export function applyPatientTheme() {
  const theme = getPatientTheme();
  document.body.dataset.patientTheme = theme;
  document.querySelectorAll('[data-theme-toggle]').forEach(button => {
    const isBlack = theme === 'black';
    button.innerHTML = isBlack
      ? '<svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>'
      : '<svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 12.8A8.5 8.5 0 1 1 11.2 3 6.7 6.7 0 0 0 21 12.8Z"/></svg>';
    button.classList.add('inline-flex', 'items-center', 'justify-center', 'rounded-full', 'shadow-sm', 'w-9', 'h-9', 'p-0');
    button.setAttribute('aria-label', isBlack ? 'Alternar para o tema tradicional' : 'Alternar para o tema black');
    button.setAttribute('title', 'Alternar tema');
    button.setAttribute('aria-pressed', String(isBlack));
  });
  document.querySelectorAll('[data-patient-logo]').forEach(logo => {
    logo.src = theme === 'black' ? '/assets/images/Logomarca_nobg_branco.png' : '/assets/images/logo_sem_fundo.png';
  });
  return theme;
}
export function togglePatientTheme() { const next = getPatientTheme() === 'black' ? 'traditional' : 'black'; localStorage.setItem('jessicamelo_patient_theme', next); applyPatientTheme(); return next; }

export const db = {
  async login(email, password) { try { const response = await rpc('app_login', { p_email: email, p_password: password }); const user = Array.isArray(response) ? response[0] : response; if (!user) return { success: false, message: 'E-mail ou senha incorretos.' }; saveSession(user); if (user.role === 'patient') localStorage.setItem('jessicamelo_patient_theme', 'black'); return { success: true, user }; } catch { const users = JSON.parse(localStorage.getItem(DB_KEY_USERS) || '[]'); const user = users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password); if (!user) return { success: false, message: 'Não foi possível conectar ao banco de dados.' }; const session = { email: user.email, name: user.name, role: user.role, isFirstAccess: !!user.isFirstAccess }; saveSession(session); if (session.role === 'patient') localStorage.setItem('jessicamelo_patient_theme', 'black'); return { success: true, user: session }; } },
  async ready() { const session = currentSession(); if (!session || !token()) return session; try { const response = await rpc('app_current_user', { p_token: token() }); const remote = Array.isArray(response) ? response[0] : response; if (!remote) { localStorage.removeItem(DB_KEY_SESSION); localStorage.removeItem('jessicamelo_token'); return null; } const next = { ...remote, token: token() }; saveSession(next); return next; } catch { return session; } },
  async logout() { try { if (token()) await rpc('app_logout', { p_token: token() }); } catch {} localStorage.removeItem(DB_KEY_SESSION); localStorage.removeItem('jessicamelo_token'); },
  getCurrentSession() { return currentSession(); },
  async changePassword(email, newPassword) { try { return await rpc('app_change_password', { p_token: token(), p_email: email, p_password: newPassword }); } catch { return { success: false, message: 'Não foi possível alterar a senha no banco.' }; } },
  async getPatients() { try { return await rpc('app_list_patients', { p_token: token() }) || []; } catch { return (JSON.parse(localStorage.getItem(DB_KEY_USERS) || '[]')).filter(u => u.role === 'patient'); } },
  async addPatient(name, email, password) { try { return await rpc('app_add_patient', { p_token: token(), p_name: name, p_email: email, p_password: password }); } catch { return { success: false, message: 'Não foi possível salvar o paciente no banco.' }; } },
  async resetPatientPassword(email, password) { try { return await rpc('app_reset_patient_password', { p_token: token(), p_email: email, p_password: password }); } catch { return { success: false, message: 'Não foi possível alterar a senha.' }; } },
  async deletePatient(email) { try { return await rpc('app_delete_patient', { p_token: token(), p_email: email }); } catch { return { success: false, message: 'Não foi possível excluir o paciente no banco.' }; } },
  async getVideos() { try { return (await rpc('app_list_videos', { p_token: token() }) || []).map(normalizeVideo); } catch { return JSON.parse(localStorage.getItem(DB_KEY_VIDEOS) || '[]').map(normalizeVideo); } },
  async getPublishedVideos() { return (await this.getVideos()).filter(v => v.published !== false); },
  async addVideo(title, theme, description, url) { const parsed = parseVideoUrl(url); if (parsed.error) return { success: false, message: parsed.error }; try { return await rpc('app_add_video', { p_token: token(), p_title: title.trim(), p_theme: theme.trim() || 'Geral', p_description: description.trim(), p_url: parsed.value, p_provider: parsed.provider, p_embed_url: parsed.embedUrl, p_thumbnail_url: parsed.thumbnailUrl }); } catch { return { success: false, message: 'Não foi possível salvar o vídeo no banco.' }; } },
  async updateVideo(id, title, theme, description, url) { const parsed = parseVideoUrl(url); if (parsed.error) return { success: false, message: parsed.error }; try { return await rpc('app_update_video', { p_token: token(), p_id: id, p_title: title.trim(), p_theme: theme.trim() || 'Geral', p_description: description.trim(), p_url: parsed.value, p_provider: parsed.provider, p_embed_url: parsed.embedUrl, p_thumbnail_url: parsed.thumbnailUrl }); } catch { return { success: false, message: 'Não foi possível atualizar o vídeo no banco.' }; } },
  async deleteVideo(id) { try { return await rpc('app_delete_video', { p_token: token(), p_id: id }); } catch { return { success: false, message: 'Não foi possível excluir o vídeo.' }; } },
  async getEbooks() { try { return (await rpc('app_list_ebooks', { p_token: token() }) || []).map(normalizeEbook); } catch { return JSON.parse(localStorage.getItem(DB_KEY_EBOOKS) || '[]').map(normalizeEbook); } },
  async getPublishedEbooks() { return (await this.getEbooks()).filter(book => book.published !== false); },
  async addEbook(title, theme, description, url) { const parsed = parseEbookUrl(url); if (parsed.error) return { success: false, message: parsed.error }; try { return await rpc('app_add_ebook', { p_token: token(), p_title: title.trim(), p_theme: theme.trim() || 'Geral', p_description: description.trim(), p_url: parsed.value, p_embed_url: parsed.embedUrl, p_thumbnail_url: parsed.thumbnailUrl }); } catch { return { success: false, message: 'Não foi possível salvar o eBook no banco.' }; } },
  async updateEbook(id, title, theme, description, url) { const parsed = parseEbookUrl(url); if (parsed.error) return { success: false, message: parsed.error }; try { return await rpc('app_update_ebook', { p_token: token(), p_id: id, p_title: title.trim(), p_theme: theme.trim() || 'Geral', p_description: description.trim(), p_url: parsed.value, p_embed_url: parsed.embedUrl, p_thumbnail_url: parsed.thumbnailUrl }); } catch { return { success: false, message: 'Não foi possível atualizar o eBook no banco.' }; } },
  async deleteEbook(id) { try { return await rpc('app_delete_ebook', { p_token: token(), p_id: id }); } catch { return { success: false, message: 'Não foi possível excluir o eBook.' }; } },
  async getCalendarData(email, year, month) { try { return await rpc('app_get_calendar', { p_token: token(), p_email: email, p_year: year, p_month: month }) || { days: {}, notes: '' }; } catch { const c = JSON.parse(localStorage.getItem(DB_KEY_CALENDARS) || '{}'); return c[email]?.[`${year}-${month}`] || { days: {}, notes: '' }; } },
  async saveCalendarData(email, year, month, days, notes, dayObservations = {}) { try { return await rpc('app_save_calendar', { p_token: token(), p_email: email, p_year: year, p_month: month, p_payload: { days, notes, dayObservations } }); } catch { return { success: false, message: 'Não foi possível salvar o calendário.' }; } },
  async saveDayObservation(email, year, month, day, observation) { const current = await this.getCalendarData(email, year, month); const dayObservations = current.dayObservations || {}; dayObservations[day] = observation; return this.saveCalendarData(email, year, month, current.days || {}, current.notes || '', dayObservations); },
  async getDayObservation(email, year, month, day) { const current = await this.getCalendarData(email, year, month); return current.dayObservations?.[day] || ''; }
};
export { parseVideoUrl, parseEbookUrl, normalizeVideo, normalizeEbook }; 
