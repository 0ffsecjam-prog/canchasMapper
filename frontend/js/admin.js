// canchasMapper - admin panel
(function () {
  'use strict';

  function $(s) { return document.querySelector(s); }
  function $$(s) { return Array.from(document.querySelectorAll(s)); }
  function toast(msg, kind = '') {
    const el = $('#toast');
    el.textContent = msg;
    el.className = 'toast ' + kind;
    setTimeout(() => el.classList.add('hidden'), 3500);
  }
  function setStatus(elId, txt, kind) {
    const e = $('#' + elId);
    e.textContent = txt;
    e.className = 'status ' + (kind || '');
  }

  async function fetchJson(url, opts = {}) {
    opts.headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    if (opts.body && typeof opts.body !== 'string') opts.body = JSON.stringify(opts.body);
    const r = await fetch(url, opts);
    const text = await r.text();
    let data;
    try { data = text ? JSON.parse(text) : {}; } catch { data = { _raw: text }; }
    if (!r.ok) throw new Error(data.error || ('HTTP ' + r.status));
    return data;
  }

  async function checkAuth() {
    try {
      const s = await fetchJson('/api/admin/status');
      if (s.authenticated) {
        showAdmin();
      } else {
        $('#login-screen').classList.remove('hidden');
      }
    } catch (err) {
      $('#login-screen').classList.remove('hidden');
    }
  }

  function showAdmin() {
    $('#login-screen').classList.add('hidden');
    $('#admin-screen').classList.remove('hidden');
    loadSettings();
    loadStats();
  }

  async function loadSettings() {
    try {
      const s = await fetchJson('/api/admin/settings');
      $('#google-browser-key').value = s.google_maps_browser_key || '';
      $('#google-server-key').value = s.google_places_server_key || '';
      $('#default-map-engine').value = s.default_map_engine || 'osm';
      $('#site-title').value = s.site_title || '';
    } catch (err) {
      toast('Error cargando settings: ' + err.message, 'error');
    }
  }

  async function saveSettings() {
    setStatus('save-status', 'guardando…');
    try {
      await fetchJson('/api/admin/settings', {
        method: 'POST',
        body: {
          google_maps_browser_key: $('#google-browser-key').value.trim(),
          google_places_server_key: $('#google-server-key').value.trim(),
          default_map_engine: $('#default-map-engine').value,
          site_title: $('#site-title').value.trim()
        }
      });
      setStatus('save-status', 'guardado ✓', 'ok');
    } catch (err) {
      setStatus('save-status', 'error: ' + err.message, 'error');
    }
  }

  async function loadStats() {
    try {
      const r = await fetchJson('/api/admin/sync/status');
      const box = $('#stats-box');
      const html = [];
      html.push(`<div><strong>Total:</strong> ${r.total.toLocaleString('es-AR')} canchas</div>`);

      if (r.running && r.running.length) {
        html.push(`<div style="color:#f59e0b;margin:6px 0">⏳ syncs en curso: ${r.running.join(', ')}</div>`);
      }

      const sourcesRow = (r.bySource || []).map(s => `<span class="stat-chip">${s.source}: ${s.c}</span>`).join('');
      if (sourcesRow) html.push(`<div class="stats-row"><strong>Por fuente:</strong> ${sourcesRow}</div>`);

      const typesRow = (r.byType || []).map(s => `<span class="stat-chip">${s.type}: ${s.c}</span>`).join('');
      if (typesRow) html.push(`<div class="stats-row"><strong>Por tipo:</strong> ${typesRow}</div>`);

      const sizesRow = (r.bySize || []).map(s => `<span class="stat-chip">${s.size}: ${s.c}</span>`).join('');
      if (sizesRow) html.push(`<div class="stats-row"><strong>Por tamaño:</strong> ${sizesRow}</div>`);

      const sportsRow = (r.bySport || []).slice(0, 20).map(s => `<span class="stat-chip">${s.sport}: ${s.c}</span>`).join('');
      if (sportsRow) html.push(`<div class="stats-row"><strong>Top deportes:</strong> ${sportsRow}</div>`);

      box.innerHTML = html.join('');

      const tbody = $('#sync-table tbody');
      tbody.innerHTML = '';
      for (const row of (r.lastSync || [])) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${row.id}</td><td>${row.source}</td><td>${row.started_at || ''}</td><td>${row.finished_at || ''}</td><td>${row.status || ''}</td><td>${row.added || 0}</td><td>${row.updated || 0}</td><td>${row.error || ''}</td>`;
        tbody.appendChild(tr);
      }
    } catch (err) {
      toast('Error stats: ' + err.message, 'error');
    }
  }

  async function login(e) {
    e.preventDefault();
    const pw = $('#login-password').value;
    const errBox = $('#login-error');
    errBox.classList.add('hidden');
    try {
      await fetchJson('/api/admin/login', { method: 'POST', body: { password: pw } });
      showAdmin();
    } catch (err) {
      errBox.textContent = 'Login inválido';
      errBox.classList.remove('hidden');
    }
  }

  async function logout() {
    try { await fetchJson('/api/admin/logout', { method: 'POST' }); } catch {}
    location.reload();
  }

  async function syncSource(source) {
    try {
      const r = await fetchJson('/api/admin/sync/' + source, { method: 'POST' });
      toast(r.message || 'Sync iniciado', 'success');
      // Empezamos a refrescar stats cada 5s mientras esté corriendo
      const interval = setInterval(async () => {
        await loadStats();
        const status = await fetchJson('/api/admin/sync/status');
        if (!status.running || !status.running.includes(source)) {
          clearInterval(interval);
          toast(`Sync ${source} terminado`, 'success');
        }
      }, 5000);
    } catch (err) {
      toast('Error: ' + err.message, 'error');
    }
  }

  async function syncAll() {
    try {
      const r = await fetchJson('/api/admin/sync-all', { method: 'POST' });
      toast(r.message || 'Remapeo iniciado', 'success');
      const interval = setInterval(async () => {
        await loadStats();
        const status = await fetchJson('/api/admin/sync/status');
        if (!status.running || !status.running.includes('all')) {
          clearInterval(interval);
          toast('Remapeo completo terminado', 'success');
        }
      }, 5000);
    } catch (err) {
      toast('Error: ' + err.message, 'error');
    }
  }

  async function changePassword() {
    const np = $('#new-password').value;
    if (!np || np.length < 6) {
      setStatus('password-status', 'mínimo 6 caracteres', 'error');
      return;
    }
    try {
      await fetchJson('/api/admin/change-password', { method: 'POST', body: { newPassword: np } });
      setStatus('password-status', 'contraseña actualizada ✓', 'ok');
      $('#new-password').value = '';
    } catch (err) {
      setStatus('password-status', 'error: ' + err.message, 'error');
    }
  }

  function bind() {
    $('#login-form').addEventListener('submit', login);
    $('#logout-btn').addEventListener('click', logout);
    $('#save-settings').addEventListener('click', saveSettings);
    $('#sync-all').addEventListener('click', syncAll);
    $('#sync-osm').addEventListener('click', () => syncSource('osm'));
    $('#sync-google').addEventListener('click', () => syncSource('google'));
    $('#sync-zones').addEventListener('click', () => syncSource('zones'));
    $('#reassign-zones').addEventListener('click', async () => {
      try {
        const r = await fetchJson('/api/admin/reassign-zones', { method: 'POST' });
        toast(`Reasignadas ${r.assigned}/${r.facilities} facilities a ${r.zones} zonas`, 'success');
        loadStats();
      } catch (err) {
        toast('Error: ' + err.message, 'error');
      }
    });
    $('#refresh-stats').addEventListener('click', loadStats);
    $('#change-password').addEventListener('click', changePassword);
  }

  document.addEventListener('DOMContentLoaded', () => {
    bind();
    checkAuth();
  });
})();
