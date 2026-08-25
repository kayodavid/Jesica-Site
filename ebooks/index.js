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
  if (!(await db.hasPatientAccess('ebooks', session.email))) { window.location.href = '/paciente.html'; return; }

  const settings = await db.getContentOrderSettings();
  const ebooks = await db.getPublishedEbooks();
  const rawSections = await db.getEbookSections();
  const byName = (a, b) => String(a.title || a.name || '').localeCompare(String(b.title || b.name || ''), 'pt-BR', { sensitivity: 'base' });
  const byRecent = (a, b) => new Date(b.createdAt || b.created_at || 0) - new Date(a.createdAt || a.created_at || 0);
  const groups = ebooks.reduce((result, ebook) => { const name = ebook.theme || 'Geral'; (result[name] ||= []).push(ebook); return result; }, {});
  Object.values(groups).forEach(list => list.sort(settings.ebook_content_order === 'alpha' ? byName : byRecent));

  const sectionMap = new Map((Array.isArray(rawSections) ? rawSections : []).map(section => [section.name || section, section]));
  Object.keys(groups).forEach(name => { if (!sectionMap.has(name)) sectionMap.set(name, { name, cover_image: '' }); });
  const sections = [...sectionMap.values()].filter(section => groups[section.name]?.length).sort((a, b) => settings.ebook_section_order === 'alpha' ? byName(a, b) : byRecent({ createdAt: Math.max(...(groups[a.name] || []).map(item => new Date(item.createdAt || item.created_at || 0).getTime()), 0) }, { createdAt: Math.max(...(groups[b.name] || []).map(item => new Date(item.createdAt || item.created_at || 0).getTime()), 0) }));

  const nav = document.getElementById('theme-nav');
  const grid = document.getElementById('ebooks-grid');
  const modal = document.getElementById('ebook-modal');
  const frame = document.getElementById('ebook-frame');
  const sidebar = document.getElementById('sidebar');
  const landing = document.getElementById('section-landing');
  const libraryHero = document.getElementById('library-hero');
  const title = document.getElementById('section-title');
  const description = document.getElementById('section-description');
  const count = document.getElementById('ebook-count');

  const close = () => { modal.classList.add('hidden'); modal.classList.remove('flex'); frame.src = ''; };
  document.getElementById('close-ebook').addEventListener('click', close);
  modal.addEventListener('click', event => { if (event.target === modal) close(); });
  modal.addEventListener('contextmenu', event => event.preventDefault());
  document.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
  document.getElementById('logout-btn').addEventListener('click', async () => { await db.logout(); window.location.href = '/login.html'; });
  document.getElementById('mobile-sidebar-btn').addEventListener('click', () => sidebar.classList.toggle('-translate-x-full'));
  document.getElementById('initial-menu-btn')?.addEventListener('click', renderLanding);

  function sectionCover(section) { return section.cover_image || groups[section.name]?.[0]?.thumbnailUrl || groups[section.name]?.[0]?.thumbnail_url || ''; }

  function renderLanding() {
    landing.innerHTML = '';
    landing.classList.remove('hidden');
    libraryHero.classList.add('hidden');
    grid.classList.add('hidden');
    document.getElementById('no-ebooks').classList.add('hidden');
    sections.forEach(section => {
      const current = groups[section.name] || [];
      const cover = sectionCover(section);
      const card = document.createElement('article');
      card.className = 'section-landing-card';
      card.innerHTML = `<div class="section-landing-cover">${cover ? `<img src="${escapeHtml(cover)}" alt="" />` : '<div class="w-full h-full flex items-center justify-center text-orange text-4xl">▤</div>'}</div><div class="section-landing-copy"><div class="min-w-0"><h2 class="font-bold text-[0.8rem] truncate">${escapeHtml(section.name)}</h2><p class="text-xs text-muted mt-1">Materiais educativos</p></div><span class="shrink-0 rounded-full bg-orange/15 text-orange px-2.5 py-1 text-[11px] font-bold">${current.length} ${current.length === 1 ? 'eBook' : 'eBooks'}</span></div>`;
      card.addEventListener('click', () => render(section.name));
      landing.appendChild(card);
    });
    nav.querySelectorAll('.section-nav-card').forEach(button => button.classList.remove('active'));
  }

  function render(name) {
    landing.classList.add('hidden');
    libraryHero.classList.remove('hidden');
    grid.classList.remove('hidden');
    const section = sections.find(item => item.name === name) || sections[0];
    if (!section) { document.getElementById('no-ebooks').classList.remove('hidden'); return; }
    const current = groups[section.name] || [];
    title.textContent = section.name;
    description.textContent = current.length === 1 ? '1 material educativo disponível nesta seção.' : `${current.length} materiais educativos disponíveis nesta seção.`;
    count.textContent = `${current.length} eBook${current.length === 1 ? '' : 's'}`;
    grid.innerHTML = '';
    document.getElementById('no-ebooks').classList.toggle('hidden', current.length > 0);

    current.forEach(ebook => {
      const card = document.createElement('article');
      card.className = 'video-card group bg-panel rounded-xl overflow-hidden border border-white/5 hover:border-orange/50 transition-all cursor-pointer';
      const thumbnail = ebook.thumbnailUrl || ebook.thumbnail_url || '';
      card.innerHTML = `<div class="relative aspect-video bg-[#30323a] overflow-hidden">${thumbnail ? `<img src="${escapeHtml(thumbnail)}" alt="${escapeHtml(ebook.title)}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" onerror="this.style.display='none'" />` : '<div class="w-full h-full flex items-center justify-center text-orange text-5xl">▤</div>'}<div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div><span class="absolute inset-0 flex items-center justify-center"><span class="w-14 h-14 rounded-full bg-orange text-dark flex items-center justify-center text-xl shadow-lg group-hover:scale-110 transition-transform">↗</span></span></div><div class="video-copy p-4 min-h-[126px]"><h2 class="font-bold text-sm sm:text-base leading-snug line-clamp-2">${escapeHtml(ebook.title)}</h2><p class="text-xs text-orange mt-3 italic">${escapeHtml(section.name)}</p><p class="text-xs text-gray-400 mt-2 line-clamp-2">${escapeHtml(ebook.description || 'Material educativo para apoiar sua jornada.')}</p></div>`;
      card.addEventListener('click', () => {
        document.getElementById('modal-theme').textContent = section.name;
        document.getElementById('modal-title').textContent = ebook.title;
        frame.src = ebook.embedUrl || ebook.embed_url || '';
        modal.classList.remove('hidden');
        modal.classList.add('flex');
      });
      grid.appendChild(card);
    });
    nav.querySelectorAll('.section-nav-card').forEach(button => button.classList.toggle('active', button.dataset.section === section.name));
    if (window.innerWidth < 1024) sidebar.classList.add('-translate-x-full');
  }

  sections.forEach((section, index) => {
    const item = document.createElement('div');
    item.dataset.section = section.name;
    item.className = `section-nav-card w-full text-left rounded-xl overflow-hidden border border-white/5 transition-all ${index === 0 ? 'active' : ''}`;
    const current = groups[section.name] || [];
    item.innerHTML = `<div class="flex items-center gap-2 p-2.5"><button type="button" class="section-open flex items-center min-w-0 flex-1 text-left"><div class="min-w-0"><p class="truncate text-sm font-semibold text-gray-200">${escapeHtml(section.name)}</p><p class="text-[11px] text-muted mt-1">${current.length} ${current.length === 1 ? 'eBook' : 'eBooks'}</p></div></button><button type="button" class="section-expand shrink-0 w-8 h-8 rounded-lg text-muted hover:text-white hover:bg-white/10 transition-all" aria-label="Listar eBooks da seção ${escapeHtml(section.name)}" aria-expanded="false"><span class="section-arrow inline-block text-lg">⌄</span></button></div><div class="section-video-list hidden"></div>`;
    const list = item.querySelector('.section-video-list');
    current.forEach(ebook => {
      const link = document.createElement('button');
      link.type = 'button';
      link.className = 'section-video-link w-full';
      const thumbnail = ebook.thumbnailUrl || ebook.thumbnail_url || '';
      link.innerHTML = `${thumbnail ? `<img class="section-video-thumb" src="${escapeHtml(thumbnail)}" alt="" onerror="this.style.display='none'" />` : '<span class="section-video-thumb flex items-center justify-center text-orange">▤</span>'}<span class="min-w-0 truncate">${escapeHtml(ebook.title || 'eBook educativo')}</span>`;
      link.title = ebook.title || '';
      link.addEventListener('click', () => render(section.name));
      list.appendChild(link);
    });
    item.querySelector('.section-open').addEventListener('click', () => render(section.name));
    item.querySelector('.section-expand').addEventListener('click', event => { event.stopPropagation(); const expanded = !list.classList.contains('hidden'); list.classList.toggle('hidden', expanded); item.classList.toggle('is-expanded', !expanded); event.currentTarget.setAttribute('aria-expanded', String(!expanded)); });
    nav.appendChild(item);
  });

  count.textContent = `${ebooks.length} material${ebooks.length === 1 ? '' : 'is'}`;
  if (sections.length) renderLanding();
  else { landing.classList.remove('hidden'); landing.innerHTML = '<div class="col-span-full border border-white/10 bg-panel rounded-2xl p-10 text-center text-muted">Nenhum material publicado ainda.</div>'; libraryHero.classList.add('hidden'); }
})();
