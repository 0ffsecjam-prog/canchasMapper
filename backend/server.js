const express = require('express');
const session = require('express-session');
const path = require('path');
const { db, getStats, upsertFacility, logSyncStart, logSyncEnd, reassignAllZones } = require('./db');
const facilitiesRouter = require('./routes/facilities');
const adminRouter = require('./routes/admin');
const zonesRouter = require('./routes/zones');
const exportRouter = require('./routes/export');
const osm = require('./sources/osm');
const zonesSource = require('./sources/zones');

const PORT = parseInt(process.env.PORT || '3000', 10);
const app = express();

// Reset opcional del hash de admin: si RESET_ADMIN_PASSWORD=1, borra el hash
// guardado en DB para que el login caiga al fallback ADMIN_PASSWORD del env.
if (process.env.RESET_ADMIN_PASSWORD === '1' || process.env.RESET_ADMIN_PASSWORD === 'true') {
  try {
    const r = db.prepare("DELETE FROM settings WHERE key='admin_password_hash'").run();
    console.log(`[reset] admin_password_hash borrado (${r.changes} fila/s). Login con ADMIN_PASSWORD del env (default admin1234).`);
  } catch (e) {
    console.warn('[reset] no pude borrar hash:', e.message);
  }
}

app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'cambiame',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 12 }
}));

app.use('/api', facilitiesRouter);
app.use('/api/zones', zonesRouter);
app.use('/api/export', exportRouter);
app.use('/api/admin', adminRouter);

app.get('/api/health', (req, res) => {
  const total = db.prepare('SELECT COUNT(*) AS c FROM facilities').get().c;
  res.json({ ok: true, total_facilities: total });
});

// Static frontend (en Docker: /app/public; en dev local: ../frontend)
const fs = require('fs');
const candidates = [path.join(__dirname, 'public'), path.join(__dirname, '..', 'frontend')];
const PUBLIC_DIR = candidates.find(p => fs.existsSync(path.join(p, 'index.html'))) || candidates[0];
console.log(`[static] sirviendo frontend desde ${PUBLIC_DIR}`);
app.use(express.static(PUBLIC_DIR));
app.get('/admin', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'admin.html')));
app.get('/', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

// Background bootstrap: si la DB está vacía, hacer un sync OSM inicial + zonas.
async function bootstrap() {
  const totalZones = db.prepare('SELECT COUNT(*) AS c FROM zones').get().c;
  if (totalZones === 0) {
    console.log('[bootstrap] Sin zonas: sincronizando límites administrativos de AMBA...');
    const syncId = logSyncStart('zones');
    try {
      const r = await zonesSource.syncZones(db);
      logSyncEnd(syncId, 'ok', r.processed, 0, null);
      console.log(`[bootstrap] ${r.processed} zonas sincronizadas`);
    } catch (err) {
      logSyncEnd(syncId, 'error', 0, 0, err.message);
      console.error('[bootstrap] sync zonas falló:', err.message);
    }
  } else {
    console.log(`[bootstrap] ${totalZones} zonas ya cargadas`);
  }

  const total = db.prepare('SELECT COUNT(*) AS c FROM facilities').get().c;
  if (total > 0) {
    console.log(`[bootstrap] ${total} canchas ya cargadas, omitiendo sync OSM inicial`);
    return;
  }
  console.log('[bootstrap] DB vacía, lanzando sync OSM inicial de AMBA en segundo plano...');
  const syncId = logSyncStart('osm');
  let added = 0, updated = 0;
  const countingUpsert = (f) => {
    const before = db.prepare('SELECT id FROM facilities WHERE source = ? AND source_id = ?').get(f.source, f.source_id);
    upsertFacility(f);
    if (before) updated++; else added++;
  };
  try {
    const r = await osm.syncAMBA(countingUpsert);
    logSyncEnd(syncId, 'ok', added, updated, null);
    console.log(`[bootstrap] sync OSM completado: ${added} agregadas, ${updated} actualizadas, ${r.processed} procesadas`);
    // Después del sync, asignamos zonas
    const r2 = reassignAllZones();
    console.log(`[bootstrap] zonas asignadas: ${r2.assigned}/${r2.facilities}`);
  } catch (err) {
    logSyncEnd(syncId, 'error', added, updated, err.message);
    console.error('[bootstrap] sync OSM falló:', err.message);
    console.error('[bootstrap] Podés reintentarlo desde el panel admin en /admin');
  }
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`canchasMapper escuchando en http://0.0.0.0:${PORT}`);
  console.log(`Frontend: /  |  Admin: /admin`);
  // No bloqueamos el arranque del server con el sync inicial.
  setTimeout(() => bootstrap().catch(e => console.error('bootstrap error:', e)), 500);
});
