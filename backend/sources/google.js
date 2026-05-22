const fetch = require('node-fetch');
const { normalizeSport, classifyType, classifySize } = require('../utils/classifier');

// Tipos de Google Places relevantes para deportes
const PLACE_TYPES = [
  'stadium', 'gym', 'bowling_alley',
  // Las búsquedas por texto cubren el resto (padel, tenis, futbol 5, club, polígono de tiro, etc.)
];

const TEXT_QUERIES = [
  // Canchas comunes
  'cancha de futbol', 'futbol 5', 'futbol 7', 'futbol 11',
  'cancha de padel', 'club de tenis', 'cancha de tenis',
  'club deportivo', 'club de campo', 'polideportivo',
  'cancha de basquet', 'club de rugby', 'club de hockey',
  'cancha de voley', 'cancha de handball', 'cancha de squash',
  // Agua
  'natatorio', 'pileta', 'piscina', 'club nautico',
  // Gimnasio / fitness / dance
  'gimnasio', 'gym', 'fitness center', 'crossfit', 'box crossfit',
  'zumba', 'clases de zumba', 'pilates', 'yoga', 'estudio de yoga',
  'spinning', 'estudio de baile', 'salsa', 'bachata', 'tango', 'ballet',
  'academia de baile', 'centro de pilates',
  // Otros
  'bowling', 'salón de pool', 'pool y billar', 'pool', 'billar', 'salón de ping pong',
  'tiro federal', 'club de tiro', 'club de golf', 'cancha de golf',
  'skate park', 'paintball', 'karting', 'pista de patinaje',
  'escalada', 'rocódromo', 'boulder',
  'artes marciales', 'karate', 'judo', 'taekwondo', 'boxeo', 'jiu jitsu',
  'tiro con arco', 'esgrima', 'minigolf'
];

// Centros para escanear AMBA: CABA + grandes núcleos GBA
const SEARCH_CENTERS = [
  { name: 'CABA',          lat: -34.6037, lng: -58.3816, radius: 9000 },
  { name: 'San Isidro',    lat: -34.4720, lng: -58.5070, radius: 8000 },
  { name: 'Tigre',         lat: -34.4264, lng: -58.5796, radius: 8000 },
  { name: 'San Martín',    lat: -34.5739, lng: -58.5378, radius: 7000 },
  { name: 'La Matanza',    lat: -34.7700, lng: -58.6300, radius: 12000 },
  { name: 'Quilmes',       lat: -34.7220, lng: -58.2540, radius: 8000 },
  { name: 'Lomas',         lat: -34.7615, lng: -58.4060, radius: 8000 },
  { name: 'Avellaneda',    lat: -34.6650, lng: -58.3650, radius: 6000 },
  { name: 'Morón',         lat: -34.6500, lng: -58.6200, radius: 8000 },
  { name: 'La Plata',      lat: -34.9214, lng: -57.9544, radius: 10000 }
];

async function googleFetch(url, params, key) {
  const u = new URL(url);
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  u.searchParams.set('key', key);
  const res = await fetch(u.toString(), { timeout: 30000 });
  if (!res.ok) throw new Error(`Google API ${res.status}`);
  const json = await res.json();
  if (json.status && !['OK', 'ZERO_RESULTS'].includes(json.status)) {
    throw new Error(`Google API status ${json.status}: ${json.error_message || ''}`);
  }
  return json;
}

function inferTypeFromGoogle(place) {
  const types = place.types || [];
  const name = (place.name || '').toLowerCase();
  if (types.includes('stadium')) return 'estadio';
  if (types.includes('bowling_alley')) return 'cancha_techada';
  if (/zumba|pilates|yoga|crossfit|spinning|baile|danza|aer[oó]bic/.test(name)) return 'gimnasio';
  if (types.includes('gym')) return 'gimnasio';
  if (/complejo|polideportivo/.test(name)) return 'complejo_deportivo';
  if (/club/.test(name)) return 'club';
  if (/natatorio/.test(name) && /cubiert|techad|indoor/.test(name)) return 'natatorio_techado';
  if (/natatorio|pileta|piscina/.test(name)) return 'natatorio';
  if (/cancha/.test(name) && /techad|cubiert|indoor/.test(name)) return 'cancha_techada';
  if (/cancha/.test(name) && /semi/.test(name)) return 'cancha_semi_techada';
  if (/cancha|futbol ?5|futbol ?7/.test(name)) return 'cancha_libre';
  if (/padel|pádel|squash|ping ?pong|pool|billar|bowling/.test(name)) return 'cancha_techada';
  return 'otro';
}

function inferSportsFromGoogle(place) {
  const name = (place.name || '').toLowerCase();
  const sports = new Set();
  const checks = [
    ['futbol|fútbol|futbol ?5|futbol ?7|futbol ?11|soccer', 'futbol'],
    ['padel|pádel|paddle', 'padel'],
    ['\\btenis\\b', 'tenis'],
    ['hockey', 'hockey'],
    ['rugby', 'rugby'],
    ['basquet|básquet|basketball|básket', 'basquet'],
    ['voley|volley|vóley', 'voley'],
    ['natación|natacion|pileta|piscina|natatorio', 'natacion'],
    ['\\bgolf\\b', 'golf'],
    ['mini ?golf', 'minigolf'],
    ['ping ?pong|tenis de mesa', 'ping_pong'],
    ['pool|billar|snooker', 'pool'],
    ['bowling|bolos', 'bowling'],
    ['tiro federal|polígono|poligono de tiro|tiro deportivo', 'tiro'],
    ['tiro con arco|arquer[ií]a', 'tiro_con_arco'],
    ['skate', 'skate'],
    ['karting', 'karting'],
    ['paintball', 'paintball'],
    ['airsoft', 'airsoft'],
    ['box(?:eo)?\\b', 'boxeo'],
    ['judo|karate|taekwondo|mma|jiu ?jitsu|kung ?fu|aikido', 'artes_marciales'],
    ['esgrima|fencing', 'esgrima'],
    ['cross ?fit', 'crossfit'],
    ['zumba', 'zumba'],
    ['pilates', 'pilates'],
    ['yoga', 'yoga'],
    ['spinning', 'spinning'],
    ['ballet', 'ballet'],
    ['baile|danza|salsa|bachata|tango|reggaeton|hip ?hop', 'baile'],
    ['aer[oó]bic', 'aerobica'],
    ['gimnasio|gym|fitness', 'fitness'],
    ['escalada|climbing|boulder|rocód?romo', 'escalada'],
    ['handball', 'handball'],
    ['squash', 'squash'],
    ['badminton|bádminton', 'badminton'],
    ['futsal', 'futsal'],
    ['hipic[oa]|equitación|equitacion|equestre', 'equitacion'],
    ['remo|kayak|canoa|canotaje', 'remo'],
    ['vela|náutico|nautico', 'vela'],
    ['atletismo', 'atletismo'],
    ['ciclismo|velódromo|velodromo', 'ciclismo']
  ];
  for (const [pattern, sport] of checks) {
    if (new RegExp(pattern).test(name)) sports.add(sport);
  }
  if ((place.types || []).includes('bowling_alley')) sports.add('bowling');
  if ((place.types || []).includes('stadium') && !sports.size) sports.add('futbol');
  if ((place.types || []).includes('gym') && !sports.size) sports.add('fitness');
  return Array.from(sports);
}

function inferSize(place) {
  const types = place.types || [];
  const name = (place.name || '').toLowerCase();
  if (types.includes('stadium')) return 'grande';
  if (/club|complejo|polideportivo/.test(name)) return 'grande';
  if (/futbol 5|futbol5|padel|pádel|squash|ping ?pong|pool|billar/.test(name)) return 'chica';
  if (/cancha/.test(name)) return 'mediana';
  return 'mediana';
}

async function getPhotoUrl(photoRef, key) {
  // Guardamos un endpoint interno que proxea contra Google Places para no exponer el server key.
  return `/api/admin/photo?ref=${encodeURIComponent(photoRef)}`;
}

async function syncAMBA(upsertFn, opts = {}) {
  const key = opts.apiKey;
  if (!key) throw new Error('Google API key no configurada');
  let processed = 0;
  const seen = new Set();

  // 1) nearbysearch por tipo
  for (const center of SEARCH_CENTERS) {
    for (const type of PLACE_TYPES) {
      let pageToken = null;
      for (let page = 0; page < 3; page++) {
        const params = {
          location: `${center.lat},${center.lng}`,
          radius: String(center.radius),
          type
        };
        if (pageToken) params.pagetoken = pageToken;
        let data;
        try {
          data = await googleFetch('https://maps.googleapis.com/maps/api/place/nearbysearch/json', params, key);
        } catch (err) {
          if (opts.onError) opts.onError(err);
          break;
        }
        for (const place of (data.results || [])) {
          if (seen.has(place.place_id)) continue;
          seen.add(place.place_id);
          await ingestPlace(place, key, upsertFn);
          processed++;
        }
        pageToken = data.next_page_token;
        if (!pageToken) break;
        // Google exige una pequeña espera antes de usar next_page_token
        await new Promise(r => setTimeout(r, 2200));
      }
    }
  }

  // 2) textsearch por queries en castellano
  for (const center of SEARCH_CENTERS) {
    for (const query of TEXT_QUERIES) {
      let pageToken = null;
      for (let page = 0; page < 3; page++) {
        const params = {
          query,
          location: `${center.lat},${center.lng}`,
          radius: String(center.radius)
        };
        if (pageToken) params.pagetoken = pageToken;
        let data;
        try {
          data = await googleFetch('https://maps.googleapis.com/maps/api/place/textsearch/json', params, key);
        } catch (err) {
          if (opts.onError) opts.onError(err);
          break;
        }
        for (const place of (data.results || [])) {
          if (seen.has(place.place_id)) continue;
          seen.add(place.place_id);
          await ingestPlace(place, key, upsertFn);
          processed++;
        }
        pageToken = data.next_page_token;
        if (!pageToken) break;
        await new Promise(r => setTimeout(r, 2200));
      }
    }
  }

  return { processed, unique: seen.size };
}

async function ingestPlace(place, key, upsertFn) {
  if (!place.geometry || !place.geometry.location) return;
  const lat = place.geometry.location.lat;
  const lng = place.geometry.location.lng;

  const photos = [];
  if (Array.isArray(place.photos)) {
    for (const ph of place.photos.slice(0, 3)) {
      if (ph.photo_reference) {
        photos.push({
          url: await getPhotoUrl(ph.photo_reference, key),
          attribution: (ph.html_attributions || []).join(' | ') || 'Google'
        });
      }
    }
  }

  upsertFn({
    source: 'google',
    source_id: place.place_id,
    name: place.name || null,
    lat, lng,
    address: place.vicinity || place.formatted_address || null,
    type: inferTypeFromGoogle(place),
    size: inferSize(place),
    area_m2: null,
    phone: null,
    website: null,
    opening_hours: null,
    raw_tags: { types: place.types, rating: place.rating, user_ratings_total: place.user_ratings_total },
    sports: inferSportsFromGoogle(place),
    photos
  });
}

module.exports = { syncAMBA };
