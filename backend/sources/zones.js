// Trae límites administrativos (barrios CABA, comunas, partidos GBA) desde OSM.
const fetch = require('node-fetch');
const { assembleRings, combinedBBox, simplifyRing } = require('../utils/geo');

const AMBA_BBOX = [-35.15, -59.55, -34.10, -57.80];

const DEFAULT_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter'
];

function buildQuery(bbox) {
  const [s, w, n, e] = bbox;
  const b = `${s},${w},${n},${e}`;
  // admin_level 8 = partido en Bs As / comuna CABA
  // admin_level 10 = barrio CABA
  // Algunas localidades tienen place=suburb / place=neighbourhood y boundary=administrative.
  return `
[out:json][timeout:120];
(
  relation["boundary"="administrative"]["admin_level"="8"]["name"](${b});
  relation["boundary"="administrative"]["admin_level"="10"]["name"](${b});
);
out geom;
`;
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
        timeout: 150000
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

function classifyZone(tags) {
  const level = parseInt(tags.admin_level, 10);
  const name = tags.name || tags['name:es'] || '';
  // CABA: admin_level 8 puede ser una comuna; 10 es un barrio.
  if (level === 10) return 'barrio';
  if (level === 8) {
    if (/^Comuna /i.test(name)) return 'comuna';
    return 'partido';
  }
  return 'otro';
}

async function syncZones(db, opts = {}) {
  const bbox = opts.bbox || AMBA_BBOX;
  const query = buildQuery(bbox);
  const data = await fetchOverpass(query);

  const insertZone = db.prepare(`
    INSERT INTO zones (osm_id, name, kind, admin_level, parent, bbox_s, bbox_w, bbox_n, bbox_e, geojson)
    VALUES (@osm_id, @name, @kind, @admin_level, @parent, @bbox_s, @bbox_w, @bbox_n, @bbox_e, @geojson)
    ON CONFLICT(osm_id) DO UPDATE SET
      name = excluded.name,
      kind = excluded.kind,
      admin_level = excluded.admin_level,
      parent = excluded.parent,
      bbox_s = excluded.bbox_s,
      bbox_w = excluded.bbox_w,
      bbox_n = excluded.bbox_n,
      bbox_e = excluded.bbox_e,
      geojson = excluded.geojson
  `);

  let count = 0;
  const tx = db.transaction(() => {
    for (const el of (data.elements || [])) {
      if (el.type !== 'relation') continue;
      const tags = el.tags || {};
      const name = tags.name || tags['name:es'];
      if (!name) continue;
      const level = parseInt(tags.admin_level, 10);
      if (![8, 10].includes(level)) continue;

      // Tomar sólo members con role outer (o sin role) que tengan geometry
      const outerWays = (el.members || []).filter(m =>
        m.type === 'way' && (m.role === 'outer' || m.role === '' || !m.role) && m.geometry
      );
      if (!outerWays.length) continue;

      const rings = assembleRings(outerWays);
      if (!rings.length) continue;

      const bbox = combinedBBox(rings);
      const geom = { type: 'Polygon', coordinates: rings };
      const kind = classifyZone(tags);

      insertZone.run({
        osm_id: `relation/${el.id}`,
        name,
        kind,
        admin_level: level,
        parent: tags['is_in:municipality'] || tags['is_in:province'] || null,
        bbox_s: bbox.s, bbox_w: bbox.w, bbox_n: bbox.n, bbox_e: bbox.e,
        geojson: JSON.stringify(geom)
      });
      count++;
    }
  });
  tx();

  return { processed: count, total: (data.elements || []).length };
}

module.exports = { syncZones, AMBA_BBOX };
