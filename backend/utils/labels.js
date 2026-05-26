// Labels y colores compartidos para exports (xlsx, html).

const TYPE_LABELS = {
  estadio: 'Estadio',
  complejo_deportivo: 'Complejo deportivo',
  complejo_techado: 'Complejo techado',
  cancha_techada: 'Cancha techada',
  cancha_semi_techada: 'Cancha semi techada',
  cancha_libre: 'Cancha libre',
  club: 'Club',
  gimnasio: 'Gimnasio',
  natatorio: 'Natatorio',
  natatorio_techado: 'Natatorio techado',
  cancha_golf: 'Cancha de golf',
  equestre: 'Centro ecuestre',
  otro: 'Otro'
};

// Colores hex (sin #) para fills de Excel y CSS en HTML.
const TYPE_COLORS = {
  estadio: 'EF4444',
  club: 'A855F7',
  complejo_deportivo: '22D3EE',
  complejo_techado: '0EA5E9',
  cancha_techada: '3B82F6',
  cancha_semi_techada: '6366F1',
  cancha_libre: '4ADE80',
  gimnasio: 'F59E0B',
  natatorio: '06B6D4',
  natatorio_techado: '0891B2',
  cancha_golf: '84CC16',
  equestre: 'EAB308',
  otro: '94A3B8'
};

const SIZE_LABELS = { chica: 'Chica', mediana: 'Mediana', grande: 'Grande' };

const SPORT_LABELS = {
  futbol: 'Fútbol', futsal: 'Futsal', futbol_americano: 'Fútbol americano',
  tenis: 'Tenis', padel: 'Pádel', basquet: 'Básquet', voley: 'Vóley',
  beach_voley: 'Beach Vóley', hockey: 'Hockey', hockey_hielo: 'Hockey sobre hielo',
  hockey_patines: 'Hockey patines', rugby: 'Rugby', golf: 'Golf', minigolf: 'Minigolf',
  natacion: 'Natación', waterpolo: 'Water polo', clavados: 'Clavados', surf: 'Surf',
  kitesurf: 'Kitesurf', remo: 'Remo', canotaje: 'Canotaje', vela: 'Vela',
  atletismo: 'Atletismo', running: 'Running', ciclismo: 'Ciclismo', bmx: 'BMX',
  skate: 'Skate', patinaje_hielo: 'Patinaje sobre hielo', patinaje: 'Patinaje',
  tiro: 'Tiro', tiro_con_arco: 'Tiro con arco', artes_marciales: 'Artes marciales',
  boxeo: 'Boxeo', lucha: 'Lucha', fitness: 'Fitness/Gym', gimnasia: 'Gimnasia',
  yoga: 'Yoga', pilates: 'Pilates', zumba: 'Zumba', crossfit: 'CrossFit',
  spinning: 'Spinning', aerobica: 'Aeróbica', baile: 'Baile/Danza', ballet: 'Ballet',
  escalada: 'Escalada', bowling: 'Bowling', bochas: 'Bochas',
  pool: 'Pool/Billar', ping_pong: 'Ping Pong', ajedrez: 'Ajedrez',
  baseball: 'Béisbol', softball: 'Softbol', cricket: 'Cricket',
  equitacion: 'Equitación', turf: 'Turf', automovilismo: 'Automovilismo',
  karting: 'Karting', motocross: 'Motocross', paintball: 'Paintball', airsoft: 'Airsoft',
  esgrima: 'Esgrima', handball: 'Handball', beach_handball: 'Beach Handball',
  badminton: 'Bádminton', squash: 'Squash', racquetball: 'Racquetball',
  multideporte: 'Multideporte'
};

function typeLabel(t) { return TYPE_LABELS[t] || t || ''; }
function sizeLabel(s) { return SIZE_LABELS[s] || s || ''; }
function sportLabel(s) { return SPORT_LABELS[s] || s || ''; }
function sportsLabels(arr) { return (arr || []).map(sportLabel); }
function typeColor(t) { return TYPE_COLORS[t] || TYPE_COLORS.otro; }

module.exports = {
  TYPE_LABELS, TYPE_COLORS, SIZE_LABELS, SPORT_LABELS,
  typeLabel, sizeLabel, sportLabel, sportsLabels, typeColor
};
