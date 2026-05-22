// Normaliza nombres de deportes (mayormente desde tags OSM) a categorías propias.
const SPORT_MAP = {
  soccer: 'futbol',
  football: 'futbol',
  futsal: 'futsal',
  american_football: 'futbol_americano',
  tennis: 'tenis',
  padel: 'padel',
  paddle: 'padel',
  basketball: 'basquet',
  volleyball: 'voley',
  beachvolleyball: 'beach_voley',
  field_hockey: 'hockey',
  hockey: 'hockey',
  ice_hockey: 'hockey_hielo',
  roller_hockey: 'hockey_patines',
  rugby_union: 'rugby',
  rugby_league: 'rugby',
  rugby: 'rugby',
  golf: 'golf',
  minigolf: 'minigolf',
  swimming: 'natacion',
  water_polo: 'waterpolo',
  diving: 'clavados',
  surfing: 'surf',
  kitesurfing: 'kitesurf',
  rowing: 'remo',
  canoe: 'canotaje',
  sailing: 'vela',
  athletics: 'atletismo',
  running: 'running',
  cycling: 'ciclismo',
  bmx: 'bmx',
  skating: 'skate',
  skateboard: 'skate',
  ice_skating: 'patinaje_hielo',
  roller_skating: 'patinaje',
  shooting: 'tiro',
  archery: 'tiro_con_arco',
  martial_arts: 'artes_marciales',
  karate: 'artes_marciales',
  judo: 'artes_marciales',
  taekwondo: 'artes_marciales',
  boxing: 'boxeo',
  wrestling: 'lucha',
  fitness: 'fitness',
  gymnastics: 'gimnasia',
  yoga: 'yoga',
  pilates: 'pilates',
  zumba: 'zumba',
  crossfit: 'crossfit',
  spinning: 'spinning',
  aerobics: 'aerobica',
  dance: 'baile',
  dancing: 'baile',
  ballet: 'ballet',
  climbing: 'escalada',
  bouldering: 'escalada',
  bowling: 'bowling',
  '10pin': 'bowling',
  bowls: 'bochas',
  petanque: 'bochas',
  billiards: 'pool',
  pool: 'pool',
  snooker: 'pool',
  table_tennis: 'ping_pong',
  chess: 'ajedrez',
  baseball: 'baseball',
  softball: 'softball',
  cricket: 'cricket',
  equestrian: 'equitacion',
  horse_racing: 'turf',
  motor: 'automovilismo',
  karting: 'karting',
  motocross: 'motocross',
  paintball: 'paintball',
  airsoft: 'airsoft',
  fencing: 'esgrima',
  handball: 'handball',
  beach_handball: 'beach_handball',
  badminton: 'badminton',
  squash: 'squash',
  racquetball: 'racquetball',
  multi: 'multideporte'
};

function normalizeSport(s) {
  if (!s) return null;
  const k = String(s).trim().toLowerCase().replace(/\s+/g, '_');
  return SPORT_MAP[k] || k;
}

function parseSports(tags) {
  const sports = new Set();
  const candidates = [tags.sport, tags['sport:1'], tags['sport:2'], tags['sport:3']];
  for (const c of candidates) {
    if (!c) continue;
    const parts = String(c).split(/[;,]+/);
    for (const p of parts) {
      const n = normalizeSport(p);
      if (n && n !== 'multi') sports.add(n);
    }
  }
  // Inferir desde nombre/club si no hay sport tag
  const name = (tags.name || '').toLowerCase();
  if (!sports.size) {
    if (/futbol|fútbol|soccer/.test(name)) sports.add('futbol');
    if (/padel|pádel|paddle/.test(name)) sports.add('padel');
    if (/tenis/.test(name)) sports.add('tenis');
    if (/básquet|basquet|basketball/.test(name)) sports.add('basquet');
    if (/hockey/.test(name)) sports.add('hockey');
    if (/rugby/.test(name)) sports.add('rugby');
    if (/golf/.test(name)) sports.add('golf');
    if (/natación|natacion|piscina|pileta/.test(name)) sports.add('natacion');
    if (/bowling|bolos/.test(name)) sports.add('bowling');
    if (/pool|billar/.test(name)) sports.add('pool');
    if (/ping ?pong|tenis de mesa/.test(name)) sports.add('ping_pong');
    if (/tiro federal|polígono|poligono de tiro/.test(name)) sports.add('tiro');
    if (/skate/.test(name)) sports.add('skate');
    if (/gim|gym|fitness/.test(name)) sports.add('fitness');
    if (/zumba/.test(name)) { sports.add('zumba'); sports.add('fitness'); }
    if (/pilates/.test(name)) { sports.add('pilates'); sports.add('fitness'); }
    if (/cross\s*fit|crossfit/.test(name)) { sports.add('crossfit'); sports.add('fitness'); }
    if (/spinning/.test(name)) { sports.add('spinning'); sports.add('fitness'); }
    if (/yoga/.test(name)) sports.add('yoga');
    if (/baile|salsa|bachata|tango|reggaeton|hip\s*hop|danza|ballet/.test(name)) sports.add('baile');
    if (/aer[oó]bic/.test(name)) sports.add('aerobica');
    if (/escalada|climbing|boulder/.test(name)) sports.add('escalada');
    if (/box|boxeo/.test(name)) sports.add('boxeo');
    if (/judo|karate|taekwondo|mma|jiu/.test(name)) sports.add('artes_marciales');
    if (/handball/.test(name)) sports.add('handball');
    if (/squash/.test(name)) sports.add('squash');
    if (/club/.test(name) && !sports.size) sports.add('multideporte');
  }
  return Array.from(sports);
}

function classifyType(tags) {
  const leisure = tags.leisure;
  const club = tags.club;
  const building = tags.building;
  const covered = tags.covered;
  const indoor = tags.indoor;
  const sport = tags.sport;

  const isCovered = covered === 'yes' || indoor === 'yes' ||
    (building && building !== 'no') ||
    sport === 'bowling' || sport === '10pin' || sport === 'billiards' ||
    sport === 'pool' || sport === 'table_tennis' || sport === 'squash';
  const isPartiallyCovered = covered === 'partial' || covered === 'partially';

  if (leisure === 'stadium') return 'estadio';
  if (leisure === 'sports_centre') return isCovered ? 'complejo_techado' : 'complejo_deportivo';
  if (leisure === 'sports_hall') return 'complejo_techado';
  if (club === 'sport') return 'club';
  if (leisure === 'fitness_centre' || leisure === 'fitness_station') return 'gimnasio';
  if (leisure === 'dance' || tags.amenity === 'dance' || tags.amenity === 'yoga') return 'gimnasio';
  if (leisure === 'swimming_pool') return isCovered ? 'natatorio_techado' : 'natatorio';
  if (leisure === 'pitch' || leisure === 'track') {
    if (isCovered) return 'cancha_techada';
    if (isPartiallyCovered) return 'cancha_semi_techada';
    return 'cancha_libre';
  }
  if (leisure === 'golf_course') return 'cancha_golf';
  if (leisure === 'horse_riding') return 'equestre';
  if (leisure === 'bowling_alley') return 'cancha_techada';
  if (leisure === 'ice_rink') return 'cancha_techada';
  if (leisure === 'climbing') return 'complejo_techado';
  if (tags.amenity === 'dojo') return 'complejo_techado';
  if (tags.amenity === 'gym') return 'gimnasio';
  if (sport && isCovered) return 'cancha_techada';
  if (sport) return 'cancha_libre';
  return 'otro';
}

function classifySize(tags, areaM2) {
  // Si tenemos área usable, clasificamos por área
  if (areaM2 && areaM2 > 0) {
    if (areaM2 < 800) return 'chica';
    if (areaM2 < 4000) return 'mediana';
    return 'grande';
  }
  // Heurísticas según tipo de deporte
  const sport = tags.sport || '';
  const leisure = tags.leisure || '';
  if (leisure === 'stadium') return 'grande';
  if (leisure === 'sports_centre' || tags.club === 'sport') return 'grande';
  if (/golf_course/.test(leisure)) return 'grande';
  if (/table_tennis|billiards|pool|chess|bowling|10pin/.test(sport)) return 'chica';
  if (/padel|tennis|squash|racquetball|badminton/.test(sport)) return 'chica';
  if (/basketball|volleyball|handball|futsal/.test(sport)) return 'mediana';
  if (/soccer|football|rugby|hockey|baseball|cricket|athletics/.test(sport)) return 'grande';
  return 'mediana';
}

function buildAddress(tags) {
  const parts = [];
  if (tags['addr:street']) {
    let street = tags['addr:street'];
    if (tags['addr:housenumber']) street += ' ' + tags['addr:housenumber'];
    parts.push(street);
  }
  if (tags['addr:suburb']) parts.push(tags['addr:suburb']);
  if (tags['addr:city']) parts.push(tags['addr:city']);
  return parts.length ? parts.join(', ') : null;
}

module.exports = {
  normalizeSport,
  parseSports,
  classifyType,
  classifySize,
  buildAddress
};
