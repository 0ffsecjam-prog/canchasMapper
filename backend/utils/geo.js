// Utilidades geométricas: point-in-polygon, bbox, simplificación.

// Ray casting algorithm. point = [lng, lat], ring = array of [lng, lat]
function pointInRing(point, ring) {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = ((yi > y) !== (yj > y)) &&
      (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInPolygons(point, polygons) {
  // polygons: array de rings. Si está en alguno, retorna true. (Ignoramos holes.)
  for (const ring of polygons) {
    if (pointInRing(point, ring)) return true;
  }
  return false;
}

function ringBBox(ring) {
  let s = Infinity, n = -Infinity, w = Infinity, e = -Infinity;
  for (const [lon, lat] of ring) {
    if (lat < s) s = lat;
    if (lat > n) n = lat;
    if (lon < w) w = lon;
    if (lon > e) e = lon;
  }
  return { s, n, w, e };
}

function combinedBBox(rings) {
  let s = Infinity, n = -Infinity, w = Infinity, e = -Infinity;
  for (const r of rings) {
    const b = ringBBox(r);
    if (b.s < s) s = b.s;
    if (b.n > n) n = b.n;
    if (b.w < w) w = b.w;
    if (b.e > e) e = b.e;
  }
  return { s, n, w, e };
}

function pointInBBox(point, bbox) {
  const [x, y] = point;
  return y >= bbox.s && y <= bbox.n && x >= bbox.w && x <= bbox.e;
}

// Douglas-Peucker simplification para rings
function simplifyRing(ring, tolerance) {
  if (ring.length < 4) return ring;
  const sqTol = tolerance * tolerance;
  return dp(ring, 0, ring.length - 1, sqTol);
}
function sqSegDist(p, p1, p2) {
  let x = p1[0], y = p1[1];
  let dx = p2[0] - x, dy = p2[1] - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) { x = p2[0]; y = p2[1]; }
    else if (t > 0) { x += dx * t; y += dy * t; }
  }
  dx = p[0] - x; dy = p[1] - y;
  return dx * dx + dy * dy;
}
function dp(points, first, last, sqTol) {
  let maxDist = 0, index = -1;
  for (let i = first + 1; i < last; i++) {
    const d = sqSegDist(points[i], points[first], points[last]);
    if (d > maxDist) { maxDist = d; index = i; }
  }
  if (maxDist > sqTol) {
    const left = dp(points, first, index, sqTol);
    const right = dp(points, index, last, sqTol);
    return left.slice(0, -1).concat(right);
  }
  return [points[first], points[last]];
}

// Ensambla rings desde "outer ways" de una relación: junta ways por endpoints.
function assembleRings(ways) {
  // ways: [{ geometry: [{lat, lon}, ...] }, ...]
  if (!ways || !ways.length) return [];
  const segments = ways
    .map(w => (w.geometry || []).map(p => [p.lon, p.lat]))
    .filter(s => s.length >= 2);
  const used = new Array(segments.length).fill(false);
  const rings = [];
  const eqPt = (a, b) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;

  for (let start = 0; start < segments.length; start++) {
    if (used[start]) continue;
    used[start] = true;
    let ring = segments[start].slice();
    let extended = true;
    let guard = 0;
    while (extended && guard++ < 10000) {
      extended = false;
      if (eqPt(ring[0], ring[ring.length - 1])) break;
      for (let i = 0; i < segments.length; i++) {
        if (used[i]) continue;
        const seg = segments[i];
        const last = ring[ring.length - 1];
        const first = ring[0];
        if (eqPt(last, seg[0])) {
          ring = ring.concat(seg.slice(1));
          used[i] = true; extended = true; break;
        }
        if (eqPt(last, seg[seg.length - 1])) {
          ring = ring.concat(seg.slice(0, -1).reverse());
          used[i] = true; extended = true; break;
        }
        if (eqPt(first, seg[seg.length - 1])) {
          ring = seg.slice(0, -1).concat(ring);
          used[i] = true; extended = true; break;
        }
        if (eqPt(first, seg[0])) {
          ring = seg.slice().reverse().slice(0, -1).concat(ring);
          used[i] = true; extended = true; break;
        }
      }
    }
    // Si no cerró, cerralo conectando endpoints (zona aproximada)
    if (!eqPt(ring[0], ring[ring.length - 1])) ring.push(ring[0]);
    if (ring.length >= 4) rings.push(ring);
  }
  return rings;
}

module.exports = {
  pointInRing,
  pointInPolygons,
  pointInBBox,
  ringBBox,
  combinedBBox,
  simplifyRing,
  assembleRings
};
