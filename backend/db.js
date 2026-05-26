const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const dbPath = path.join(DATA_DIR, 'canchasmapper.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// User-defined function: normaliza texto (saca acentos, lowercase) para búsqueda
const stripAccents = (s) => s ? String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase() : '';
db.function('strip_accents', { deterministic: true }, stripAccents);

db.exec(`
CREATE TABLE IF NOT EXISTS facilities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  source_id TEXT NOT NULL,
  name TEXT,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  address TEXT,
  type TEXT,
  size TEXT,
  area_m2 REAL,
  phone TEXT,
  website TEXT,
  opening_hours TEXT,
  raw_tags TEXT,
  last_seen TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(source, source_id)
);

CREATE TABLE IF NOT EXISTS facility_sports (
  facility_id INTEGER NOT NULL,
  sport TEXT NOT NULL,
  PRIMARY KEY (facility_id, sport),
  FOREIGN KEY (facility_id) REFERENCES facilities(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS facility_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  facility_id INTEGER NOT NULL,
  url TEXT NOT NULL,
  attribution TEXT,
  source TEXT,
  FOREIGN KEY (facility_id) REFERENCES facilities(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS sync_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  started_at TEXT DEFAULT CURRENT_TIMESTAMP,
  finished_at TEXT,
  status TEXT,
  added INTEGER DEFAULT 0,
  updated INTEGER DEFAULT 0,
  error TEXT
);

CREATE TABLE IF NOT EXISTS zones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  osm_id TEXT UNIQUE,
  name TEXT NOT NULL,
  kind TEXT,
  admin_level INTEGER,
  parent TEXT,
  bbox_s REAL, bbox_w REAL, bbox_n REAL, bbox_e REAL,
  geojson TEXT
);

CREATE TABLE IF NOT EXISTS facility_zones (
  facility_id INTEGER NOT NULL,
  zone_id INTEGER NOT NULL,
  PRIMARY KEY (facility_id, zone_id),
  FOREIGN KEY (facility_id) REFERENCES facilities(id) ON DELETE CASCADE,
  FOREIGN KEY (zone_id) REFERENCES zones(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_facilities_latlng ON facilities(lat, lng);
CREATE INDEX IF NOT EXISTS idx_facility_sports_sport ON facility_sports(sport);
CREATE INDEX IF NOT EXISTS idx_facilities_type ON facilities(type);
CREATE INDEX IF NOT EXISTS idx_facilities_size ON facilities(size);
CREATE INDEX IF NOT EXISTS idx_zones_kind ON zones(kind);
CREATE INDEX IF NOT EXISTS idx_zones_bbox ON zones(bbox_s, bbox_n, bbox_w, bbox_e);
CREATE INDEX IF NOT EXISTS idx_fzones_zone ON facility_zones(zone_id);
`);

function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setSetting(key, value) {
  db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value);
}

const upsertFacilityStmt = db.prepare(`
  INSERT INTO facilities (source, source_id, name, lat, lng, address, type, size, area_m2, phone, website, opening_hours, raw_tags, last_seen)
  VALUES (@source, @source_id, @name, @lat, @lng, @address, @type, @size, @area_m2, @phone, @website, @opening_hours, @raw_tags, CURRENT_TIMESTAMP)
  ON CONFLICT(source, source_id) DO UPDATE SET
    name = excluded.name,
    lat = excluded.lat,
    lng = excluded.lng,
    address = excluded.address,
    type = excluded.type,
    size = excluded.size,
    area_m2 = excluded.area_m2,
    phone = excluded.phone,
    website = excluded.website,
    opening_hours = excluded.opening_hours,
    raw_tags = excluded.raw_tags,
    last_seen = CURRENT_TIMESTAMP
  RETURNING id
`);

const insertSportStmt = db.prepare(`
  INSERT OR IGNORE INTO facility_sports (facility_id, sport) VALUES (?, ?)
`);

const deleteSportsStmt = db.prepare(`DELETE FROM facility_sports WHERE facility_id = ?`);
const deletePhotosStmt = db.prepare(`DELETE FROM facility_photos WHERE facility_id = ? AND source = ?`);
const insertPhotoStmt = db.prepare(`
  INSERT INTO facility_photos (facility_id, url, attribution, source) VALUES (?, ?, ?, ?)
`);

function upsertFacility(facility) {
  const tx = db.transaction((f) => {
    const result = upsertFacilityStmt.get({
      source: f.source,
      source_id: f.source_id,
      name: f.name || null,
      lat: f.lat,
      lng: f.lng,
      address: f.address || null,
      type: f.type || null,
      size: f.size || null,
      area_m2: f.area_m2 || null,
      phone: f.phone || null,
      website: f.website || null,
      opening_hours: f.opening_hours || null,
      raw_tags: f.raw_tags ? JSON.stringify(f.raw_tags) : null
    });
    const facilityId = result.id;
    deleteSportsStmt.run(facilityId);
    if (Array.isArray(f.sports)) {
      for (const sport of f.sports) {
        if (sport) insertSportStmt.run(facilityId, sport);
      }
    }
    if (Array.isArray(f.photos)) {
      deletePhotosStmt.run(facilityId, f.source);
      for (const photo of f.photos) {
        if (photo && photo.url) {
          insertPhotoStmt.run(facilityId, photo.url, photo.attribution || null, f.source);
        }
      }
    }
    return facilityId;
  });
  return tx(facility);
}

function buildFacilityWhere(filters = {}) {
  const where = [];
  const params = {};

  if (filters.bbox) {
    const [s, w, n, e] = filters.bbox.split(',').map(Number);
    where.push('f.lat BETWEEN @south AND @north AND f.lng BETWEEN @west AND @east');
    params.south = s; params.west = w; params.north = n; params.east = e;
  }

  if (filters.types && filters.types.length) {
    const placeholders = filters.types.map((_, i) => `@type${i}`).join(',');
    where.push(`f.type IN (${placeholders})`);
    filters.types.forEach((t, i) => params[`type${i}`] = t);
  }

  if (filters.sizes && filters.sizes.length) {
    const placeholders = filters.sizes.map((_, i) => `@size${i}`).join(',');
    where.push(`f.size IN (${placeholders})`);
    filters.sizes.forEach((s, i) => params[`size${i}`] = s);
  }

  if (filters.sports && filters.sports.length) {
    const placeholders = filters.sports.map((_, i) => `@sport${i}`).join(',');
    where.push(`f.id IN (SELECT facility_id FROM facility_sports WHERE sport IN (${placeholders}))`);
    filters.sports.forEach((s, i) => params[`sport${i}`] = s);
  }

  if (filters.zones && filters.zones.length) {
    const placeholders = filters.zones.map((_, i) => `@zone${i}`).join(',');
    where.push(`f.id IN (SELECT facility_id FROM facility_zones WHERE zone_id IN (${placeholders}))`);
    filters.zones.forEach((z, i) => params[`zone${i}`] = z);
  }

  if (filters.q) {
    // Búsqueda permisiva, insensible a mayúsculas y acentos.
    where.push(`(
      strip_accents(f.name) LIKE @q
      OR strip_accents(f.address) LIKE @q
      OR strip_accents(f.raw_tags) LIKE @q
      OR f.id IN (SELECT facility_id FROM facility_sports WHERE strip_accents(sport) LIKE @q)
    )`);
    params.q = `%${stripAccents(filters.q)}%`;
  }

  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
  return { whereClause, params };
}

function listFacilities(filters = {}, opts = {}) {
  const { whereClause, params } = buildFacilityWhere(filters);
  // Sin tope artificial: por defecto trae todo. Cap alto sólo por seguridad.
  const limit = Math.min(parseInt(filters.limit, 10) || 1000000, 1000000);

  if (opts.compact) {
    // Payload liviano para el mapa: sin zonas ni photo_count (subqueries caras).
    const sql = `
      SELECT f.id, f.name, f.lat, f.lng, f.type, f.size,
        (SELECT GROUP_CONCAT(sport) FROM facility_sports WHERE facility_id = f.id) AS sports_csv
      FROM facilities f
      ${whereClause}
      ORDER BY f.id
      LIMIT ${limit}
    `;
    return db.prepare(sql).all(params).map(r => ({
      id: r.id,
      name: r.name,
      lat: r.lat,
      lng: r.lng,
      type: r.type,
      size: r.size,
      sports: r.sports_csv ? r.sports_csv.split(',') : []
    }));
  }

  const sql = `
    SELECT f.*,
      (SELECT GROUP_CONCAT(sport) FROM facility_sports WHERE facility_id = f.id) AS sports_csv,
      (SELECT COUNT(*) FROM facility_photos WHERE facility_id = f.id) AS photo_count,
      (SELECT GROUP_CONCAT(z.name, '||') FROM facility_zones fz JOIN zones z ON z.id = fz.zone_id WHERE fz.facility_id = f.id) AS zones_csv
    FROM facilities f
    ${whereClause}
    ORDER BY f.id
    LIMIT ${limit}
  `;
  const rows = db.prepare(sql).all(params);
  return rows.map(r => ({
    id: r.id,
    source: r.source,
    source_id: r.source_id,
    name: r.name,
    lat: r.lat,
    lng: r.lng,
    address: r.address,
    type: r.type,
    size: r.size,
    area_m2: r.area_m2,
    phone: r.phone,
    website: r.website,
    opening_hours: r.opening_hours,
    sports: r.sports_csv ? r.sports_csv.split(',') : [],
    photo_count: r.photo_count,
    zones: r.zones_csv ? r.zones_csv.split('||') : []
  }));
}

// Para export: incluye zonas separadas por tipo + 1ra foto.
function listFacilitiesForExport(filters = {}) {
  const { whereClause, params } = buildFacilityWhere(filters);
  const limit = Math.min(parseInt(filters.limit, 10) || 1000000, 1000000);
  const sql = `
    SELECT f.*,
      (SELECT GROUP_CONCAT(sport) FROM facility_sports WHERE facility_id = f.id) AS sports_csv,
      (SELECT GROUP_CONCAT(z.name || '~' || COALESCE(z.kind,''), '||') FROM facility_zones fz JOIN zones z ON z.id = fz.zone_id WHERE fz.facility_id = f.id) AS zones_csv,
      (SELECT url FROM facility_photos WHERE facility_id = f.id LIMIT 1) AS photo_url
    FROM facilities f
    ${whereClause}
    ORDER BY f.name
    LIMIT ${limit}
  `;
  const rows = db.prepare(sql).all(params);
  return rows.map(r => {
    const zoneObjs = (r.zones_csv ? r.zones_csv.split('||') : []).map(z => {
      const [name, kind] = z.split('~');
      return { name, kind };
    });
    const barrios = zoneObjs.filter(z => z.kind === 'barrio' || z.kind === 'comuna').map(z => z.name);
    const partidos = zoneObjs.filter(z => z.kind === 'partido').map(z => z.name);
    return {
      id: r.id,
      source: r.source,
      name: r.name,
      lat: r.lat,
      lng: r.lng,
      address: r.address,
      type: r.type,
      size: r.size,
      area_m2: r.area_m2,
      phone: r.phone,
      website: r.website,
      opening_hours: r.opening_hours,
      sports: r.sports_csv ? r.sports_csv.split(',') : [],
      barrios,
      partidos,
      zones: zoneObjs.map(z => z.name),
      photo_url: r.photo_url || null
    };
  });
}

function getFacility(id) {
  const f = db.prepare('SELECT * FROM facilities WHERE id = ?').get(id);
  if (!f) return null;
  const sports = db.prepare('SELECT sport FROM facility_sports WHERE facility_id = ?').all(id).map(r => r.sport);
  const photos = db.prepare('SELECT url, attribution, source FROM facility_photos WHERE facility_id = ?').all(id);
  const zones = db.prepare(`
    SELECT z.id, z.name, z.kind, z.admin_level
    FROM facility_zones fz JOIN zones z ON z.id = fz.zone_id
    WHERE fz.facility_id = ?
    ORDER BY z.admin_level DESC
  `).all(id);
  return { ...f, raw_tags: f.raw_tags ? JSON.parse(f.raw_tags) : null, sports, photos, zones };
}

function listZones() {
  return db.prepare(`
    SELECT id, name, kind, admin_level, parent, bbox_s, bbox_w, bbox_n, bbox_e,
      (SELECT COUNT(*) FROM facility_zones WHERE zone_id = zones.id) AS facility_count
    FROM zones
    ORDER BY kind, name
  `).all();
}

function getZoneGeometry(id) {
  const row = db.prepare('SELECT id, name, kind, admin_level, geojson FROM zones WHERE id = ?').get(id);
  if (!row) return null;
  return { id: row.id, name: row.name, kind: row.kind, admin_level: row.admin_level, geometry: row.geojson ? JSON.parse(row.geojson) : null };
}

function getAllZonesWithGeometry() {
  return db.prepare('SELECT id, name, kind, admin_level, geojson FROM zones').all().map(r => ({
    id: r.id, name: r.name, kind: r.kind, admin_level: r.admin_level,
    geometry: r.geojson ? JSON.parse(r.geojson) : null
  }));
}

// Asigna zonas a una facility por point-in-polygon (rings outer ignorando holes).
function assignZonesToFacility(facilityId, lat, lng, polygonsByZone) {
  const { pointInPolygons, pointInBBox } = require('./utils/geo');
  const pt = [lng, lat];
  const matches = [];
  for (const z of polygonsByZone) {
    if (!pointInBBox(pt, { s: z.bbox_s, n: z.bbox_n, w: z.bbox_w, e: z.bbox_e })) continue;
    if (pointInPolygons(pt, z.rings)) matches.push(z.id);
  }
  const delStmt = db.prepare('DELETE FROM facility_zones WHERE facility_id = ?');
  const insStmt = db.prepare('INSERT OR IGNORE INTO facility_zones (facility_id, zone_id) VALUES (?, ?)');
  const tx = db.transaction(() => {
    delStmt.run(facilityId);
    for (const zid of matches) insStmt.run(facilityId, zid);
  });
  tx();
  return matches;
}

function reassignAllZones() {
  // Pre-cargar polygonos parseados de todas las zonas
  const zonesRaw = db.prepare('SELECT id, bbox_s, bbox_n, bbox_w, bbox_e, geojson FROM zones').all();
  const polygons = zonesRaw.map(z => {
    let rings = [];
    try {
      const g = JSON.parse(z.geojson);
      if (g && g.type === 'Polygon') rings = g.coordinates;
      else if (g && g.type === 'MultiPolygon') rings = [].concat(...g.coordinates);
    } catch {}
    return { id: z.id, rings, bbox_s: z.bbox_s, bbox_n: z.bbox_n, bbox_w: z.bbox_w, bbox_e: z.bbox_e };
  });
  const facs = db.prepare('SELECT id, lat, lng FROM facilities').all();
  let assigned = 0;
  for (const f of facs) {
    const m = assignZonesToFacility(f.id, f.lat, f.lng, polygons);
    if (m.length) assigned++;
  }
  return { facilities: facs.length, assigned, zones: polygons.length };
}

function getStats() {
  const total = db.prepare('SELECT COUNT(*) AS c FROM facilities').get().c;
  const byType = db.prepare('SELECT type, COUNT(*) AS c FROM facilities GROUP BY type').all();
  const bySize = db.prepare('SELECT size, COUNT(*) AS c FROM facilities GROUP BY size').all();
  const bySport = db.prepare(`
    SELECT sport, COUNT(*) AS c FROM facility_sports GROUP BY sport ORDER BY c DESC
  `).all();
  const bySource = db.prepare('SELECT source, COUNT(*) AS c FROM facilities GROUP BY source').all();
  const lastSync = db.prepare('SELECT * FROM sync_log ORDER BY id DESC LIMIT 10').all();
  return { total, byType, bySize, bySport, bySource, lastSync };
}

function logSyncStart(source) {
  const result = db.prepare('INSERT INTO sync_log (source, status) VALUES (?, ?)').run(source, 'running');
  return result.lastInsertRowid;
}

function logSyncEnd(id, status, added, updated, error) {
  db.prepare(`
    UPDATE sync_log
    SET finished_at = CURRENT_TIMESTAMP, status = ?, added = ?, updated = ?, error = ?
    WHERE id = ?
  `).run(status, added || 0, updated || 0, error || null, id);
}

module.exports = {
  db,
  getSetting,
  setSetting,
  upsertFacility,
  listFacilities,
  listFacilitiesForExport,
  getFacility,
  getStats,
  logSyncStart,
  logSyncEnd,
  listZones,
  getZoneGeometry,
  getAllZonesWithGeometry,
  assignZonesToFacility,
  reassignAllZones
};
