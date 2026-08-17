import { db, applyPatientTheme, togglePatientTheme } from '/assets/js/db.js';

(async () => {
  applyPatientTheme();
  document.querySelectorAll('[data-theme-toggle]').forEach(button => button.addEventListener('click', togglePatientTheme));

  const session = await db.ready();
  if (!session || session.role !== 'patient') {
    window.location.href = session && session.role === 'admin' ? '/admin.html' : '/login.html';
    return;
  }

  const videos = await db.getPublishedVideos();
  const groups = videos.reduce((result, video) => {
    const theme = video.theme || 'Geral';
    (result[theme] ||= []).push(video);
    return result;
  }, {});
  const themes = Object.keys(groups).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const nav = document.getElementById('theme-nav');
  const grid = document.getElementById('videos-grid');
  const modal = document.getElementById('player-modal');
  const frame = document.getElementById('player-frame');

  document.getElementById('video-count').textContent = `${videos.length} vídeo${videos.length === 1 ? '' : 's'}`;
  document.getElementById('no-videos').classList.toggle('hidden', videos.length > 0);

  const close = () => {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    frame.src = '';
  };
  document.getElementById('close-player').addEventListener('click', close);
  modal.addEventListener('click', event => { if (event.target === modal) close(); });
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await db.logout();
    window.location.href = '/login.html';
  });
  document.getElementById('mobile-sidebar-btn').addEventListener('click', () => document.getElementById('sidebar').classList.toggle('-translate-x-full'));

  function render(theme) {
    grid.innerHTML = '';
    groups[theme].forEach(video => {
      const card = document.createElement('article');
      card.className = 'group bg-panel rounded-xl overflow-hidden border border-white/5 hover:border-orange/50 transition-all cursor-pointer';
      const thumbnail = video.thumbnailUrl || video.thumbnail_url || '';
      card.innerHTML = `<div class="relative aspect-video bg-[#30323a] overflow-hidden">${thumbnail ? `<img src="${thumbnail}" alt="${video.title}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" onerror="this.style.display='none'" />` : '<div class="w-full h-full flex items-center justify-center text-orange text-5xl">▶</div>'}<div class="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent"></div><span class="absolute inset-0 flex items-center justify-center"><span class="w-12 h-12 rounded-full bg-orange text-dark flex items-center justify-center text-lg shadow-lg group-hover:scale-110 transition-transform">▶</span></span></div><div class="p-4"><h2 class="font-bold text-sm sm:text-base leading-snug line-clamp-2">${video.title}</h2><p class="text-xs text-orange mt-3 italic">${theme}</p><p class="text-xs text-gray-400 mt-2 line-clamp-2">${video.description || 'Conteúdo educativo para apoiar sua jornada.'}</p></div>`;
      card.addEventListener('click', () => {
        document.getElementById('modal-theme').textContent = theme;
        document.getElementById('modal-title').textContent = video.title;
        frame.src = video.embedUrl || video.embed_url || '';
        modal.classList.remove('hidden');
        modal.classList.add('flex');
      });
      grid.appendChild(card);
    });
  }

  themes.forEach((theme, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `w-full text-left px-3 py-3 rounded-xl flex items-center gap-3 text-sm font-semibold transition-all ${index === 0 ? 'bg-orange/20 text-orange' : 'text-gray-300 hover:bg-white/5 hover:text-white'}`;
    button.innerHTML = `<span class="w-8 h-8 rounded-full bg-orange/20 text-orange flex items-center justify-center text-xs font-bold">${String(index + 1).padStart(2, '0')}</span><span class="truncate">${theme}</span><span class="ml-auto text-xs text-muted">${groups[theme].length}</span>`;
    button.addEventListener('click', () => render(theme));
    nav.appendChild(button);
  });
  if (themes.length) render(themes[0]);
})();
