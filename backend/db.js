const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const dbPath = path.join(DATA_DIR, 'canchasmapper.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

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

CREATE INDEX IF NOT EXISTS idx_facilities_latlng ON facilities(lat, lng);
CREATE INDEX IF NOT EXISTS idx_facility_sports_sport ON facility_sports(sport);
CREATE INDEX IF NOT EXISTS idx_facilities_type ON facilities(type);
CREATE INDEX IF NOT EXISTS idx_facilities_size ON facilities(size);
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

function listFacilities(filters = {}) {
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

  if (filters.q) {
    where.push(`(f.name LIKE @q OR f.address LIKE @q)`);
    params.q = `%${filters.q}%`;
  }

  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const limit = Math.min(parseInt(filters.limit, 10) || 2000, 5000);

  const sql = `
    SELECT f.*,
      (SELECT GROUP_CONCAT(sport) FROM facility_sports WHERE facility_id = f.id) AS sports_csv,
      (SELECT COUNT(*) FROM facility_photos WHERE facility_id = f.id) AS photo_count
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
    photo_count: r.photo_count
  }));
}

function getFacility(id) {
  const f = db.prepare('SELECT * FROM facilities WHERE id = ?').get(id);
  if (!f) return null;
  const sports = db.prepare('SELECT sport FROM facility_sports WHERE facility_id = ?').all(id).map(r => r.sport);
  const photos = db.prepare('SELECT url, attribution, source FROM facility_photos WHERE facility_id = ?').all(id);
  return { ...f, raw_tags: f.raw_tags ? JSON.parse(f.raw_tags) : null, sports, photos };
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
  getFacility,
  getStats,
  logSyncStart,
  logSyncEnd
};
