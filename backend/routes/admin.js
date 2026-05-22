const express = require('express');
const bcrypt = require('bcryptjs');
const fetch = require('node-fetch');
const { getSetting, setSetting, db, upsertFacility, logSyncStart, logSyncEnd, getStats, reassignAllZones } = require('../db');
const osm = require('../sources/osm');
const google = require('../sources/google');
const zones = require('../sources/zones');
const zonesRoute = require('./zones');

const router = express.Router();

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin1234';

function requireAuth(req, res, next) {
  if (req.session && req.session.admin) return next();
  return res.status(401).json({ error: 'unauthorized' });
}

router.post('/login', async (req, res) => {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'password_required' });

  // Si hay un hash guardado, comparamos contra él. Si no, comparamos contra ADMIN_PASSWORD del env.
  const storedHash = getSetting('admin_password_hash');
  let ok = false;
  if (storedHash) {
    ok = await bcrypt.compare(password, storedHash);
  } else {
    ok = password === ADMIN_PASSWORD;
  }
  if (!ok) return res.status(401).json({ error: 'invalid_credentials' });
  req.session.admin = true;
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/status', (req, res) => {
  res.json({ authenticated: !!(req.session && req.session.admin) });
});

router.post('/change-password', requireAuth, async (req, res) => {
  const { newPassword } = req.body || {};
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'password_too_short' });
  }
  const hash = await bcrypt.hash(newPassword, 10);
  setSetting('admin_password_hash', hash);
  res.json({ ok: true });
});

// === Settings ===
const PUBLIC_SETTINGS = ['google_maps_browser_key', 'site_title'];
const ADMIN_SETTINGS = [
  'google_maps_browser_key', // expuesta al frontend para renderizar GMaps si se elige
  'google_places_server_key', // sólo backend, para syncs
  'site_title',
  'default_map_engine' // 'osm' | 'google'
];

router.get('/settings', requireAuth, (req, res) => {
  const result = {};
  for (const k of ADMIN_SETTINGS) result[k] = getSetting(k);
  res.json(result);
});

router.post('/settings', requireAuth, (req, res) => {
  const body = req.body || {};
  for (const k of ADMIN_SETTINGS) {
    if (k in body) setSetting(k, body[k] || '');
  }
  res.json({ ok: true });
});

// Endpoint público con sólo las settings seguras de exponer al frontend
router.get('/public-settings', (req, res) => {
  const result = {};
  for (const k of PUBLIC_SETTINGS) result[k] = getSetting(k) || null;
  result['default_map_engine'] = getSetting('default_map_engine') || 'osm';
  result['has_google_server_key'] = !!getSetting('google_places_server_key');
  res.json(result);
});

// === Sync ===
let syncRunning = {};

router.post('/sync/:source', requireAuth, async (req, res) => {
  const source = req.params.source;
  if (!['osm', 'google', 'zones'].includes(source)) {
    return res.status(400).json({ error: 'unknown_source' });
  }
  if (syncRunning[source]) {
    return res.status(409).json({ error: 'sync_already_running' });
  }

  // Lanzamos en background y respondemos rápido
  const syncId = logSyncStart(source);
  syncRunning[source] = true;
  res.json({ ok: true, sync_id: syncId, message: `Sync ${source} iniciado` });

  let added = 0, updated = 0;
  const countingUpsert = (f) => {
    const before = db.prepare('SELECT id FROM facilities WHERE source = ? AND source_id = ?').get(f.source, f.source_id);
    upsertFacility(f);
    if (before) updated++; else added++;
  };

  try {
    if (source === 'osm') {
      await osm.syncAMBA(countingUpsert);
      const r = reassignAllZones();
      console.log(`[zone-reassign] ${r.assigned}/${r.facilities} facilities asignadas a zonas`);
    } else if (source === 'google') {
      const key = getSetting('google_places_server_key');
      if (!key) throw new Error('Google Places key no configurada');
      await google.syncAMBA(countingUpsert, { apiKey: key });
      const r = reassignAllZones();
      console.log(`[zone-reassign] ${r.assigned}/${r.facilities} facilities asignadas a zonas`);
    } else if (source === 'zones') {
      const r = await zones.syncZones(db);
      added = r.processed;
      const r2 = reassignAllZones();
      updated = r2.assigned;
      console.log(`[zones] ${r.processed} zonas, ${r2.assigned}/${r2.facilities} facilities asignadas`);
      zonesRoute.invalidateCache();
    }
    logSyncEnd(syncId, 'ok', added, updated, null);
  } catch (err) {
    logSyncEnd(syncId, 'error', added, updated, err.message);
    console.error(`[sync ${source}] error:`, err);
  } finally {
    delete syncRunning[source];
  }
});

// Reasigna facilities a zonas sin tocar datos
router.post('/reassign-zones', requireAuth, (req, res) => {
  try {
    const r = reassignAllZones();
    res.json({ ok: true, ...r });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/sync/status', requireAuth, (req, res) => {
  const stats = getStats();
  res.json({
    running: Object.keys(syncRunning),
    ...stats
  });
});

// Proxy de fotos de Google para no exponer el server key al frontend
router.get('/photo', async (req, res) => {
  const ref = req.query.ref;
  if (!ref) return res.status(400).send('missing ref');
  const key = getSetting('google_places_server_key') || getSetting('google_maps_browser_key');
  if (!key) return res.status(503).send('no key configured');
  try {
    const u = new URL('https://maps.googleapis.com/maps/api/place/photo');
    u.searchParams.set('maxwidth', '640');
    u.searchParams.set('photo_reference', ref);
    u.searchParams.set('key', key);
    const upstream = await fetch(u.toString(), { redirect: 'follow' });
    res.set('Content-Type', upstream.headers.get('content-type') || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    upstream.body.pipe(res);
  } catch (err) {
    res.status(502).send('upstream error');
  }
});

module.exports = router;
module.exports.requireAuth = requireAuth;
