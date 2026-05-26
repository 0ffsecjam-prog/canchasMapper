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
// Centros para escanear todo el AMBA (CABA + 40 partidos + La Plata).
// Cada nearbysearch/textsearch trae hasta ~60 resultados, así que conviene
// muchos centros con radios moderados para no perder densidad.
const SEARCH_CENTERS = [
  { name: 'CABA centro',     lat: -34.6037, lng: -58.3816, radius: 7000 },
  { name: 'CABA sur',        lat: -34.6500, lng: -58.4200, radius: 6000 },
  { name: 'CABA norte',      lat: -34.5650, lng: -58.4500, radius: 6000 },
  { name: 'San Isidro',      lat: -34.4720, lng: -58.5070, radius: 7000 },
  { name: 'Vicente López',   lat: -34.5260, lng: -58.4790, radius: 6000 },
  { name: 'Tigre',           lat: -34.4264, lng: -58.5796, radius: 8000 },
  { name: 'San Fernando',    lat: -34.4410, lng: -58.5560, radius: 6000 },
  { name: 'San Martín',      lat: -34.5739, lng: -58.5378, radius: 7000 },
  { name: 'Tres de Febrero', lat: -34.6000, lng: -58.5650, radius: 6000 },
  { name: 'San Miguel',      lat: -34.5430, lng: -58.7120, radius: 8000 },
  { name: 'Pilar',           lat: -34.4585, lng: -58.9140, radius: 12000 },
  { name: 'Escobar',         lat: -34.3490, lng: -58.7960, radius: 10000 },
  { name: 'Campana/Zárate',  lat: -34.1630, lng: -58.9590, radius: 14000 },
  { name: 'Luján',           lat: -34.5700, lng: -59.1050, radius: 12000 },
  { name: 'Gral Rodríguez',  lat: -34.6080, lng: -58.9520, radius: 10000 },
  { name: 'Moreno',          lat: -34.6510, lng: -58.7900, radius: 9000 },
  { name: 'Merlo',           lat: -34.6650, lng: -58.7270, radius: 8000 },
  { name: 'Morón',           lat: -34.6500, lng: -58.6200, radius: 7000 },
  { name: 'Ituzaingó',       lat: -34.6580, lng: -58.6680, radius: 6000 },
  { name: 'La Matanza N',    lat: -34.7000, lng: -58.6300, radius: 9000 },
  { name: 'La Matanza S',    lat: -34.8200, lng: -58.6600, radius: 11000 },
  { name: 'Marcos Paz',      lat: -34.7800, lng: -58.8380, radius: 10000 },
  { name: 'Cañuelas',        lat: -35.0530, lng: -58.7610, radius: 13000 },
  { name: 'Ezeiza',          lat: -34.8530, lng: -58.5230, radius: 9000 },
  { name: 'Esteban Echeverría', lat: -34.8120, lng: -58.4600, radius: 7000 },
  { name: 'Lomas',           lat: -34.7615, lng: -58.4060, radius: 7000 },
  { name: 'Avellaneda',      lat: -34.6650, lng: -58.3650, radius: 6000 },
  { name: 'Lanús',           lat: -34.7060, lng: -58.3920, radius: 6000 },
  { name: 'Quilmes',         lat: -34.7220, lng: -58.2540, radius: 8000 },
  { name: 'Berazategui',     lat: -34.7650, lng: -58.2120, radius: 8000 },
  { name: 'Florencio Varela',lat: -34.8260, lng: -58.2760, radius: 9000 },
  { name: 'Almirante Brown', lat: -34.8200, lng: -58.3870, radius: 8000 },
  { name: 'Pte Perón/SVicente', lat: -35.0100, lng: -58.4200, radius: 12000 },
  { name: 'La Plata',        lat: -34.9214, lng: -57.9544, radius: 11000 },
  { name: 'Berisso/Ensenada',lat: -34.8730, lng: -57.8860, radius: 9000 }
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
