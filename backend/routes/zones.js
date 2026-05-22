const express = require('express');
const { listZones, getZoneGeometry, getAllZonesWithGeometry } = require('../db');
const { simplifyRing } = require('../utils/geo');

const router = express.Router();

let cachedSimplifiedGeoJSON = null;
let cachedSimplifiedAt = 0;

router.get('/', (req, res) => {
  res.json({ zones: listZones() });
});

router.get('/geometry', (req, res) => {
  // Cache simplificado de todas las zonas como FeatureCollection
  const now = Date.now();
  if (!cachedSimplifiedGeoJSON || (now - cachedSimplifiedAt) > 60_000) {
    const tol = parseFloat(req.query.tolerance) || 0.0003; // ~33m
    const zones = getAllZonesWithGeometry();
    const features = [];
    for (const z of zones) {
      if (!z.geometry) continue;
      const simplified = (z.geometry.coordinates || []).map(ring => simplifyRing(ring, tol));
      features.push({
        type: 'Feature',
        properties: { id: z.id, name: z.name, kind: z.kind, admin_level: z.admin_level },
        geometry: { type: 'Polygon', coordinates: simplified }
      });
    }
    cachedSimplifiedGeoJSON = { type: 'FeatureCollection', features };
    cachedSimplifiedAt = now;
  }
  res.set('Cache-Control', 'public, max-age=60');
  res.json(cachedSimplifiedGeoJSON);
});

router.get('/:id/geometry', (req, res) => {
  const z = getZoneGeometry(parseInt(req.params.id, 10));
  if (!z) return res.status(404).json({ error: 'not_found' });
  res.json(z);
});

module.exports = router;
module.exports.invalidateCache = () => { cachedSimplifiedGeoJSON = null; };
