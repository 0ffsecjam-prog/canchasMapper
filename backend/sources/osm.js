const fetch = require('node-fetch');
const { parseSports, classifyType, classifySize, buildAddress } = require('../utils/classifier');

// AMBA bounding box: cubre CABA + GBA (norte/oeste/sur).
// south, west, north, east
const AMBA_BBOX = [-34.92, -58.75, -34.30, -58.25];

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
  nwr["leisure"="swimming_pool"](${b});
  nwr["leisure"="golf_course"](${b});
  nwr["leisure"="horse_riding"](${b});
  nwr["leisure"="bowling_alley"](${b});
  nwr["club"="sport"](${b});
  nwr["sport"](${b});
  nwr["amenity"="dojo"](${b});
  nwr["amenity"="gym"](${b});
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

async function syncAMBA(upsertFn, opts = {}) {
  const bbox = opts.bbox || AMBA_BBOX;
  const query = buildQuery(bbox);
  const data = await fetchOverpass(query);
  let count = 0;
  for (const el of (data.elements || [])) {
    const coords = getCoords(el);
    if (!coords) continue;
    const tags = el.tags || {};
    if (!tags.sport && !tags.leisure && !tags.club && !tags.amenity) continue;

    const sports = parseSports(tags);
    const type = classifyType(tags);
    const areaM2 = getAreaM2(el);
    const size = classifySize(tags, areaM2);
    const address = buildAddress(tags);

    // Foto si la entidad la trae (algunos POIs tienen wikimedia_commons o image)
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
      source_id: `${el.type}/${el.id}`,
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
    count++;
  }
  return { processed: count, total: (data.elements || []).length };
}

module.exports = { syncAMBA, AMBA_BBOX };
