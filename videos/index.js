import { db, applyPatientTheme, togglePatientTheme } from '/assets/js/db.js';

const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));

(async () => {
  applyPatientTheme();
  document.querySelectorAll('[data-theme-toggle]').forEach(button => button.addEventListener('click', togglePatientTheme));

  const session = await db.ready();
  if (!session || session.role !== 'patient') {
    window.location.href = session && session.role === 'admin' ? '/admin.html' : '/login.html';
    return;
  }

  const videos = await db.getPublishedVideos();
  const rawSections = await db.getSections();
  const groups = videos.reduce((result, video) => {
    const name = video.theme || 'Geral';
    (result[name] ||= []).push(video);
    return result;
  }, {});
  const sectionMap = new Map((Array.isArray(rawSections) ? rawSections : []).map(section => [section.name || section, section]));
  Object.keys(groups).forEach(name => { if (!sectionMap.has(name)) sectionMap.set(name, { name, cover_image: '' }); });
  const sections = [...sectionMap.values()].filter(section => groups[section.name]?.length).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const nav = document.getElementById('theme-nav');
  const grid = document.getElementById('videos-grid');
  const modal = document.getElementById('player-modal');
  const frame = document.getElementById('player-frame');
  const sidebar = document.getElementById('sidebar');
  const title = document.getElementById('section-title');
  const description = document.getElementById('section-description');
  const count = document.getElementById('video-count');
  const landing = document.getElementById('section-landing');
  const libraryHero = document.getElementById('library-hero');

  const close = () => { modal.classList.add('hidden'); modal.classList.remove('flex'); frame.src = ''; };
  document.getElementById('close-player').addEventListener('click', close);
  modal.addEventListener('click', event => { if (event.target === modal) close(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
  document.getElementById('logout-btn').addEventListener('click', async () => { await db.logout(); window.location.href = '/login.html'; });
  document.getElementById('mobile-sidebar-btn').addEventListener('click', () => sidebar.classList.toggle('-translate-x-full'));
  document.getElementById('initial-menu-btn')?.addEventListener('click', renderLanding);

  function sectionCover(section) { return section.cover_image || groups[section.name]?.[0]?.thumbnailUrl || groups[section.name]?.[0]?.thumbnail_url || ''; }
  function renderLanding() {
    landing.innerHTML = '';
    landing.classList.remove('hidden'); libraryHero.classList.add('hidden'); grid.classList.add('hidden'); document.getElementById('no-videos').classList.add('hidden');
    sections.forEach(section => {
      const current = groups[section.name] || []; const cover = sectionCover(section); const card = document.createElement('article'); card.className = 'section-landing-card';
      card.innerHTML = `<div class="section-landing-cover">${cover ? `<img src="${escapeHtml(cover)}" alt="" />` : '<div class="w-full h-full flex items-center justify-center text-orange text-4xl">▦</div>'}</div><div class="section-landing-copy"><div class="min-w-0"><h2 class="font-bold text-[0.8rem] truncate">${escapeHtml(section.name)}</h2><p class="text-xs text-muted mt-1">Conteúdos educativos</p></div><span class="shrink-0 rounded-full bg-orange/15 text-orange px-2.5 py-1 text-[11px] font-bold">${current.length} ${current.length === 1 ? 'vídeo' : 'vídeos'}</span></div>`;
      card.addEventListener('click', () => render(section.name)); landing.appendChild(card);
    });
    nav.querySelectorAll('.section-nav-card').forEach(button => button.classList.remove('active'));
  }
  function render(name) {
    landing.classList.add('hidden'); libraryHero.classList.remove('hidden'); grid.classList.remove('hidden');
    const section = sections.find(item => item.name === name) || sections[0];
    if (!section) { document.getElementById('no-videos').classList.remove('hidden'); return; }
    const current = groups[section.name] || [];
    title.textContent = section.name;
    description.textContent = `${current.length} conteúdo${current.length === 1 ? '' : 's'} educativo${current.length === 1 ? '' : 's'} disponível${current.length === 1 ? '' : 'eis'} nesta seção.`;
    count.textContent = `${current.length} vídeo${current.length === 1 ? '' : 's'}`;
    grid.innerHTML = '';
    document.getElementById('no-videos').classList.toggle('hidden', current.length > 0);
    current.forEach(video => {
      const card = document.createElement('article');
      card.className = 'video-card group bg-panel rounded-xl overflow-hidden border border-white/5 hover:border-orange/50 transition-all cursor-pointer';
      const thumbnail = video.thumbnailUrl || video.thumbnail_url || '';
      card.innerHTML = `<div class="relative aspect-video bg-[#30323a] overflow-hidden">${thumbnail ? `<img src="${escapeHtml(thumbnail)}" alt="${escapeHtml(video.title)}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" onerror="this.style.display='none'" />` : '<div class="w-full h-full flex items-center justify-center text-orange text-5xl">▶</div>'}<div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div><span class="absolute inset-0 flex items-center justify-center"><span class="w-14 h-14 rounded-full bg-orange text-dark flex items-center justify-center text-xl shadow-lg group-hover:scale-110 transition-transform">▶</span></span></div><div class="video-copy p-4 min-h-[126px]"><h2 class="font-bold text-sm sm:text-base leading-snug line-clamp-2">${escapeHtml(video.title)}</h2><p class="text-xs text-orange mt-3 italic">${escapeHtml(section.name)}</p><p class="text-xs text-gray-400 mt-2 line-clamp-2">${escapeHtml(video.description || 'Conteúdo educativo para apoiar sua jornada.')}</p></div>`;
      card.addEventListener('click', () => { document.getElementById('modal-theme').textContent = section.name; document.getElementById('modal-title').textContent = video.title; frame.src = video.embedUrl || video.embed_url || ''; modal.classList.remove('hidden'); modal.classList.add('flex'); });
      grid.appendChild(card);
    });
    nav.querySelectorAll('.section-nav-card').forEach(button => button.classList.toggle('active', button.dataset.section === section.name));
    if (window.innerWidth < 1024) sidebar.classList.add('-translate-x-full');
  }

  sections.forEach((section, index) => {
    const button = document.createElement('button');
    button.type = 'button'; button.dataset.section = section.name; button.className = `section-nav-card w-full text-left rounded-xl overflow-hidden border border-white/5 transition-all ${index === 0 ? 'active' : ''}`;
    const cover = sectionCover(section);
    button.innerHTML = `<div class="flex items-center gap-3 p-2.5"><div class="w-12 h-12 rounded-lg overflow-hidden bg-[#30323a] shrink-0">${cover ? `<img src="${escapeHtml(cover)}" alt="" class="w-full h-full object-cover" />` : '<div class="w-full h-full flex items-center justify-center text-orange">▦</div>'}</div><div class="min-w-0"><p class="truncate text-sm font-semibold text-gray-200">${escapeHtml(section.name)}</p><p class="text-[11px] text-muted mt-1">${groups[section.name].length} vídeo${groups[section.name].length === 1 ? '' : 's'}</p></div></div>`;
    button.addEventListener('click', () => render(section.name)); nav.appendChild(button);
  });

  count.textContent = `${videos.length} vídeo${videos.length === 1 ? '' : 's'}`;
  if (sections.length) renderLanding(); else { landing.classList.remove('hidden'); landing.innerHTML = '<div class="col-span-full border border-white/10 bg-panel rounded-2xl p-10 text-center text-muted">Nenhum conteúdo publicado ainda.</div>'; libraryHero.classList.add('hidden'); }
})();
