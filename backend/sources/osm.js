const fetch = require('node-fetch');
const { parseSports, classifyType, classifySize, buildAddress } = require('../utils/classifier');

// AMBA bounding box: CABA + los 40 partidos del Gran Buenos Aires + La Plata.
// Cubre desde Campana/Pilar (norte) hasta La Plata/Brandsen (sur), de
// Luján/Marcos Paz (oeste) al Río de la Plata (este).
// south, west, north, east
const AMBA_BBOX = [-35.15, -59.55, -34.10, -57.80];

const DEFAULT_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter'
];

function buildQuery(bbox) {
  const [s, w, n, e] = bbox;
  const b = `${s},${w},${n},${e}`;
  // Trae canchas, complejos, clubes, estadios, gimnasios, piletas, bowling, etc.
  return `
[out:json][timeout:90];
(
  nwr["leisure"="pitch"](${b});
  nwr["leisure"="sports_centre"](${b});
  nwr["leisure"="sports_hall"](${b});
  nwr["leisure"="stadium"](${b});
  nwr["leisure"="track"](${b});
  nwr["leisure"="fitness_centre"](${b});
  nwr["leisure"="fitness_station"](${b});
  nwr["leisure"="dance"](${b});
  nwr["leisure"="swimming_pool"](${b});
  nwr["leisure"="golf_course"](${b});
  nwr["leisure"="horse_riding"](${b});
  nwr["leisure"="bowling_alley"](${b});
  nwr["leisure"="ice_rink"](${b});
  nwr["leisure"="climbing"](${b});
  nwr["club"="sport"](${b});
  nwr["sport"](${b});
  nwr["amenity"="dojo"](${b});
  nwr["amenity"="gym"](${b});
  nwr["amenity"="dance"](${b});
  nwr["amenity"="yoga"](${b});
  nwr["shop"="sports"]["sport"](${b});
);
out center tags;
`;
}

function getCoords(el) {
  if (el.type === 'node') return { lat: el.lat, lng: el.lon };
  if (el.center) return { lat: el.center.lat, lng: el.center.lon };
  return null;
}

// Estimación de área para ways/relations (sin datos crudos). Usamos null si no la tenemos.
function getAreaM2(el) {
  if (el.tags && el.tags['area']) {
    const n = parseFloat(el.tags['area']);
    if (!isNaN(n)) return n;
  }
  return null;
}

async function fetchOverpass(query) {
  let lastError = null;
  for (const endpoint of DEFAULT_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'canchasMapper/1.0 (+https://github.com/0ffsecjam-prog/canchasmapper)'
        },
        body: 'data=' + encodeURIComponent(query),
        timeout: 120000
      });
      if (!res.ok) {
        lastError = new Error(`${endpoint} respondió ${res.status}`);
        continue;
      }
      return await res.json();
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('Todos los endpoints de Overpass fallaron');
}

function processElement(el, upsertFn, seen) {
  const coords = getCoords(el);
  if (!coords) return false;
  const tags = el.tags || {};
  if (!tags.sport && !tags.leisure && !tags.club && !tags.amenity) return false;
  const sourceId = `${el.type}/${el.id}`;
  if (seen && seen.has(sourceId)) return false;
  if (seen) seen.add(sourceId);

  const sports = parseSports(tags);
  const type = classifyType(tags);
  const areaM2 = getAreaM2(el);
  const size = classifySize(tags, areaM2);
  const address = buildAddress(tags);

  const photos = [];
  if (tags.image) photos.push({ url: tags.image, attribution: 'OSM contributors' });
  if (tags.wikimedia_commons && /^File:/i.test(tags.wikimedia_commons)) {
    const fileName = tags.wikimedia_commons.replace(/^File:/i, '').replace(/\s/g, '_');
    photos.push({
      url: `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(fileName)}?width=640`,
      attribution: 'Wikimedia Commons'
    });
  }

  upsertFn({
    source: 'osm',
    source_id: sourceId,
    name: tags.name || tags['name:es'] || null,
    lat: coords.lat,
    lng: coords.lng,
    address,
    type,
    size,
    area_m2: areaM2,
    phone: tags.phone || tags['contact:phone'] || null,
    website: tags.website || tags['contact:website'] || null,
    opening_hours: tags.opening_hours || null,
    raw_tags: tags,
    sports,
    photos
  });
  return true;
}

// Divide un bbox [s,w,n,e] en una grilla rows×cols de subboxes.
function makeTiles(bbox, rows, cols) {
  const [s, w, n, e] = bbox;
  const dLat = (n - s) / rows;
  const dLng = (e - w) / cols;
  const tiles = [];
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      tiles.push([s + i * dLat, w + j * dLng, s + (i + 1) * dLat, w + (j + 1) * dLng]);
    }
  }
  return tiles;
}

async function syncAMBA(upsertFn, opts = {}) {
  const bbox = opts.bbox || AMBA_BBOX;
  // Troceamos en grilla para no exceder límites de Overpass y cubrir todo AMBA.
  const rows = opts.rows || 5;
  const cols = opts.cols || 5;
  const tiles = opts.bbox && opts.noTile ? [bbox] : makeTiles(bbox, rows, cols);
  const seen = new Set();
  let processed = 0;
  let tilesOk = 0;
  const errors = [];

  for (let t = 0; t < tiles.length; t++) {
    const query = buildQuery(tiles[t]);
    try {
      const data = await fetchOverpass(query);
      let tileCount = 0;
      for (const el of (data.elements || [])) {
        if (processElement(el, upsertFn, seen)) { processed++; tileCount++; }
      }
      tilesOk++;
      if (opts.onProgress) opts.onProgress({ tile: t + 1, total: tiles.length, processed, tileCount });
      console.log(`[osm] tile ${t + 1}/${tiles.length}: +${tileCount} (total únicos ${processed})`);
    } catch (err) {
      errors.push(`tile ${t + 1}: ${err.message}`);
      console.warn(`[osm] tile ${t + 1}/${tiles.length} falló: ${err.message}`);
    }
    // Respiro entre requests para no abusar de Overpass
    if (t < tiles.length - 1) await new Promise(r => setTimeout(r, 1200));
  }

  if (tilesOk === 0) {
    throw new Error('Overpass no respondió en ningún tile: ' + errors.slice(0, 3).join('; '));
  }
  return { processed, tiles: tiles.length, tilesOk, errors };
}

module.exports = { syncAMBA, AMBA_BBOX, makeTiles };
