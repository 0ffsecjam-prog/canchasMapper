// canchasMapper - frontend principal
(function () {
  'use strict';

  // ===== Tile providers =====
  const TILE_PROVIDERS = {
    'osm': {
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      options: { maxZoom: 19, attribution: '© OpenStreetMap contributors' }
    },
    'carto-light': {
      url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
      options: { maxZoom: 19, attribution: '© OSM · © CARTO' }
    },
    'carto-dark': {
      url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      options: { maxZoom: 19, attribution: '© OSM · © CARTO' }
    },
    'esri-sat': {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      options: { maxZoom: 19, attribution: 'Tiles © Esri' }
    },
    'opentopo': {
      url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
      options: { maxZoom: 17, attribution: '© OpenTopoMap (CC-BY-SA)' }
    }
  };

  const TYPE_LABELS = {
    'estadio': 'Estadio',
    'complejo_deportivo': 'Complejo deportivo',
    'complejo_techado': 'Complejo techado',
    'cancha_techada': 'Cancha techada',
    'cancha_semi_techada': 'Cancha semi techada',
    'cancha_libre': 'Cancha libre',
    'club': 'Club',
    'gimnasio': 'Gimnasio',
    'natatorio': 'Natatorio',
    'natatorio_techado': 'Natatorio techado',
    'cancha_golf': 'Cancha de golf',
    'equestre': 'Centro ecuestre',
    'otro': 'Otro'
  };

  const SPORT_LABELS = {
    futbol: 'Fútbol', futsal: 'Futsal', futbol_americano: 'Fútbol americano',
    tenis: 'Tenis', padel: 'Pádel', basquet: 'Básquet', voley: 'Vóley',
    beach_voley: 'Beach Vóley', hockey: 'Hockey', hockey_hielo: 'Hockey sobre hielo',
    hockey_patines: 'Hockey patines', rugby: 'Rugby', golf: 'Golf', minigolf: 'Minigolf',
    natacion: 'Natación', waterpolo: 'Water polo', clavados: 'Clavados', surf: 'Surf',
    kitesurf: 'Kitesurf', remo: 'Remo', canotaje: 'Canotaje', vela: 'Vela',
    atletismo: 'Atletismo', running: 'Running', ciclismo: 'Ciclismo', bmx: 'BMX',
    skate: 'Skate', patinaje_hielo: 'Patinaje sobre hielo', patinaje: 'Patinaje',
    tiro: 'Tiro', tiro_con_arco: 'Tiro con arco', artes_marciales: 'Artes marciales',
    boxeo: 'Boxeo', lucha: 'Lucha', fitness: 'Fitness/Gym', gimnasia: 'Gimnasia',
    yoga: 'Yoga', escalada: 'Escalada', bowling: 'Bowling', bochas: 'Bochas',
    pool: 'Pool/Billar', ping_pong: 'Ping Pong', ajedrez: 'Ajedrez',
    baseball: 'Béisbol', softball: 'Softbol', cricket: 'Cricket',
    equitacion: 'Equitación', turf: 'Turf', automovilismo: 'Automovilismo',
    karting: 'Karting', motocross: 'Motocross', paintball: 'Paintball', airsoft: 'Airsoft',
    esgrima: 'Esgrima', handball: 'Handball', beach_handball: 'Beach Handball',
    badminton: 'Bádminton', squash: 'Squash', racquetball: 'Racquetball',
    multideporte: 'Multideporte'
  };

  // Lista canónica de tipos para los chips
  const TYPES_ORDER = [
    'estadio', 'club', 'complejo_deportivo', 'complejo_techado',
    'cancha_libre', 'cancha_techada', 'cancha_semi_techada',
    'gimnasio', 'natatorio', 'natatorio_techado', 'cancha_golf', 'equestre', 'otro'
  ];

  // Color por tipo (para markers)
  const TYPE_COLORS = {
    'estadio': '#ef4444',
    'club': '#a855f7',
    'complejo_deportivo': '#22d3ee',
    'complejo_techado': '#0ea5e9',
    'cancha_techada': '#3b82f6',
    'cancha_semi_techada': '#6366f1',
    'cancha_libre': '#4ade80',
    'gimnasio': '#f59e0b',
    'natatorio': '#06b6d4',
    'natatorio_techado': '#0891b2',
    'cancha_golf': '#84cc16',
    'equestre': '#eab308',
    'otro': '#94a3b8'
  };

  const state = {
    map: null,
    cluster: null,
    tileLayer: null,
    facilities: [],
    filters: {
      types: new Set(),
      sizes: new Set(),
      sports: new Set(),
      q: ''
    },
    settings: {},
    debounceTimer: null
  };

  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return Array.from(document.querySelectorAll(sel)); }

  function toast(msg, kind = '') {
    const el = $('#toast');
    el.textContent = msg;
    el.className = 'toast ' + kind;
    setTimeout(() => el.classList.add('hidden'), 3500);
  }

  function setTile(engine) {
    if (state.tileLayer) state.map.removeLayer(state.tileLayer);
    const provider = TILE_PROVIDERS[engine] || TILE_PROVIDERS['osm'];
    state.tileLayer = L.tileLayer(provider.url, provider.options).addTo(state.map);
  }

  function makeIcon(type) {
    const color = TYPE_COLORS[type] || '#94a3b8';
    const html = `<div style="
      width: 14px; height: 14px;
      background: ${color};
      border: 2px solid #0f1419;
      border-radius: 50%;
      box-shadow: 0 0 0 1px ${color}55, 0 2px 4px rgba(0,0,0,0.5);
    "></div>`;
    return L.divIcon({
      className: 'cm-marker',
      html,
      iconSize: [14, 14],
      iconAnchor: [7, 7]
    });
  }

  function renderTypeChips() {
    const container = $('#filter-types');
    container.innerHTML = '';
    for (const type of TYPES_ORDER) {
      const id = `t-${type}`;
      const label = TYPE_LABELS[type] || type;
      const chip = document.createElement('label');
      chip.className = 'chip';
      chip.innerHTML = `<input type="checkbox" value="${type}" id="${id}"><span>${label}</span>`;
      chip.querySelector('input').addEventListener('change', e => {
        if (e.target.checked) state.filters.types.add(type);
        else state.filters.types.delete(type);
        applyFilters();
      });
      container.appendChild(chip);
    }
  }

  function renderSportChips(sportsList) {
    const container = $('#filter-sports');
    container.innerHTML = '';
    const sortedSports = sportsList.slice().sort((a, b) => {
      const la = (SPORT_LABELS[a] || a).toLowerCase();
      const lb = (SPORT_LABELS[b] || b).toLowerCase();
      return la.localeCompare(lb);
    });
    for (const sport of sortedSports) {
      const label = SPORT_LABELS[sport] || sport;
      const chip = document.createElement('label');
      chip.className = 'chip';
      chip.dataset.sport = sport;
      chip.dataset.label = label.toLowerCase();
      chip.innerHTML = `<input type="checkbox" value="${sport}"><span>${label}</span>`;
      chip.querySelector('input').addEventListener('change', e => {
        if (e.target.checked) state.filters.sports.add(sport);
        else state.filters.sports.delete(sport);
        applyFilters();
      });
      container.appendChild(chip);
    }
  }

  function applyFilters() {
    if (state.debounceTimer) clearTimeout(state.debounceTimer);
    state.debounceTimer = setTimeout(loadFacilities, 200);
  }

  async function loadPublicSettings() {
    try {
      const r = await fetch('/api/admin/public-settings');
      state.settings = await r.json();
      const engine = state.settings.default_map_engine || 'osm';
      $('#map-engine').value = engine in TILE_PROVIDERS ? engine : 'osm';
      // Si hay browser key, habilitar opción google (placeholder, requeriría SDK GMaps)
      if (state.settings.google_maps_browser_key) {
        $('#map-engine option[value="google"]').disabled = false;
      }
      if (state.settings.site_title) {
        document.title = state.settings.site_title + ' · AMBA';
        $('.brand strong').textContent = state.settings.site_title;
      }
    } catch (err) {
      console.warn('No pude cargar settings públicas:', err);
    }
  }

  async function loadFacilities() {
    const params = new URLSearchParams();
    if (state.filters.types.size) params.set('types', Array.from(state.filters.types).join(','));
    if (state.filters.sizes.size) params.set('sizes', Array.from(state.filters.sizes).join(','));
    if (state.filters.sports.size) params.set('sports', Array.from(state.filters.sports).join(','));
    if (state.filters.q) params.set('q', state.filters.q);
    params.set('limit', '3000');

    try {
      const r = await fetch('/api/facilities?' + params.toString());
      const data = await r.json();
      state.facilities = data.facilities || [];
      renderMarkers();
      $('#count-badge').textContent = `${data.count.toLocaleString('es-AR')} resultados`;
    } catch (err) {
      toast('Error cargando canchas: ' + err.message, 'error');
    }
  }

  function renderMarkers() {
    if (!state.cluster) return;
    state.cluster.clearLayers();
    const markers = [];
    for (const f of state.facilities) {
      const m = L.marker([f.lat, f.lng], { icon: makeIcon(f.type) });
      m.bindTooltip(buildTooltip(f), { direction: 'top', offset: [0, -8] });
      m.on('click', () => showDetail(f.id));
      markers.push(m);
    }
    state.cluster.addLayers(markers);
  }

  function buildTooltip(f) {
    const parts = [];
    parts.push(`<strong>${escapeHtml(f.name || '(sin nombre)')}</strong>`);
    if (f.type) parts.push(`<div style="font-size:11px;color:#9aa9bb">${TYPE_LABELS[f.type] || f.type}${f.size ? ' · ' + f.size : ''}</div>`);
    if (f.sports && f.sports.length) {
      const labels = f.sports.slice(0, 4).map(s => SPORT_LABELS[s] || s);
      parts.push(`<div style="font-size:11px;color:#4ade80">${labels.join(' · ')}</div>`);
    }
    return parts.join('');
  }

  async function showDetail(id) {
    const panel = $('#detail-panel');
    const content = $('#detail-content');
    content.innerHTML = '<div class="meta">cargando…</div>';
    panel.classList.remove('hidden');
    try {
      const r = await fetch('/api/facilities/' + id);
      const f = await r.json();
      content.innerHTML = renderDetail(f);
    } catch (err) {
      content.innerHTML = `<div class="error">Error: ${err.message}</div>`;
    }
  }

  function renderDetail(f) {
    const tags = [];
    if (f.type) tags.push(`<span class="tag type">${TYPE_LABELS[f.type] || f.type}</span>`);
    if (f.size) tags.push(`<span class="tag size">tamaño: ${f.size}</span>`);
    for (const s of (f.sports || [])) tags.push(`<span class="tag sport">${SPORT_LABELS[s] || s}</span>`);

    const photos = (f.photos || []).map(p =>
      `<img src="${escapeAttr(p.url)}" alt="foto" loading="lazy" onerror="this.style.display='none'" onclick="window.open('${escapeAttr(p.url)}','_blank')">`
    ).join('');

    const lines = [];
    lines.push(`<h2>${escapeHtml(f.name || '(sin nombre)')}</h2>`);
    lines.push(`<div class="meta">Fuente: ${f.source.toUpperCase()} · ID ${f.id}</div>`);
    if (tags.length) lines.push(`<div class="tags">${tags.join('')}</div>`);
    if (photos) lines.push(`<div class="photos">${photos}</div>`);
    if (f.address) lines.push(`<div><strong>📍</strong> ${escapeHtml(f.address)}</div>`);
    if (f.phone) lines.push(`<div><strong>📞</strong> ${escapeHtml(f.phone)}</div>`);
    if (f.website) lines.push(`<div><strong>🌐</strong> <a href="${escapeAttr(f.website)}" target="_blank" rel="noopener">${escapeHtml(f.website)}</a></div>`);
    if (f.opening_hours) lines.push(`<div><strong>🕒</strong> ${escapeHtml(f.opening_hours)}</div>`);
    if (f.area_m2) lines.push(`<div><strong>📐</strong> ${Math.round(f.area_m2).toLocaleString('es-AR')} m²</div>`);

    const gmapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${f.lat},${f.lng}`;
    const osmUrl = `https://www.openstreetmap.org/?mlat=${f.lat}&mlon=${f.lng}#map=18/${f.lat}/${f.lng}`;
    lines.push(`<div class="actions">
      <a class="btn-primary" href="${gmapsUrl}" target="_blank" rel="noopener">Cómo llegar</a>
      <a class="btn-secondary" href="${osmUrl}" target="_blank" rel="noopener">Ver en OSM</a>
    </div>`);

    return lines.join('');
  }

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function escapeAttr(s) { return escapeHtml(s); }

  async function loadStats() {
    try {
      const r = await fetch('/api/stats');
      const s = await r.json();
      const box = $('#sidebar-stats');
      const html = [];
      html.push(`<div><span>Total</span><strong>${s.total.toLocaleString('es-AR')}</strong></div>`);
      const top = (s.bySport || []).slice(0, 6);
      if (top.length) {
        html.push(`<div style="margin-top:8px;color:#9aa9bb">Top deportes:</div>`);
        for (const row of top) {
          html.push(`<div><span>${SPORT_LABELS[row.sport] || row.sport}</span><strong>${row.c}</strong></div>`);
        }
      }
      box.innerHTML = html.join('');

      // Llenar deportes para filtros con TODOS los que existen en DB
      const allSports = (s.bySport || []).map(r => r.sport);
      renderSportChips(allSports);
    } catch (err) {
      // ignore
    }
  }

  function bindEvents() {
    $('#map-engine').addEventListener('change', e => setTile(e.target.value));

    $('#search').addEventListener('input', e => {
      state.filters.q = e.target.value.trim();
      applyFilters();
    });

    $$('#filter-sizes input').forEach(inp => {
      inp.addEventListener('change', e => {
        const v = e.target.value;
        if (e.target.checked) state.filters.sizes.add(v);
        else state.filters.sizes.delete(v);
        applyFilters();
      });
    });

    $('#sport-search').addEventListener('input', e => {
      const q = e.target.value.trim().toLowerCase();
      $$('#filter-sports .chip').forEach(chip => {
        chip.style.display = chip.dataset.label.includes(q) ? '' : 'none';
      });
    });

    $('#reset-filters').addEventListener('click', () => {
      state.filters.types.clear();
      state.filters.sizes.clear();
      state.filters.sports.clear();
      state.filters.q = '';
      $('#search').value = '';
      $('#sport-search').value = '';
      $$('.chip input[type=checkbox]').forEach(i => i.checked = false);
      $$('#filter-sports .chip').forEach(c => c.style.display = '');
      loadFacilities();
    });

    $('#detail-close').addEventListener('click', () => $('#detail-panel').classList.add('hidden'));

    $('#toggle-filters').addEventListener('click', () => {
      const s = $('#sidebar');
      s.classList.toggle('hidden');
    });
  }

  function init() {
    state.map = L.map('map', { center: [-34.6037, -58.4416], zoom: 11, preferCanvas: true });
    setTile('osm');

    state.cluster = L.markerClusterGroup({
      maxClusterRadius: 50,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      chunkedLoading: true
    });
    state.map.addLayer(state.cluster);

    renderTypeChips();
    bindEvents();
    loadPublicSettings().then(() => {
      const engine = $('#map-engine').value;
      setTile(engine);
    });
    loadStats();
    loadFacilities();

    // Refrescar stats cada 30s por si hay sync en progreso
    setInterval(() => { loadStats(); }, 30000);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
