const express = require('express');
const { listFacilities, getFacility, getStats } = require('../db');

const router = express.Router();

router.get('/facilities', (req, res) => {
  try {
    const filters = {
      bbox: req.query.bbox,
      types: req.query.types ? String(req.query.types).split(',').filter(Boolean) : null,
      sizes: req.query.sizes ? String(req.query.sizes).split(',').filter(Boolean) : null,
      sports: req.query.sports ? String(req.query.sports).split(',').filter(Boolean) : null,
      zones: req.query.zones ? String(req.query.zones).split(',').map(Number).filter(n => !isNaN(n)) : null,
      q: req.query.q,
      limit: req.query.limit
    };
    const compact = req.query.compact === '1' || req.query.compact === 'true';
    const data = listFacilities(filters, { compact });
    res.json({ count: data.length, facilities: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/facilities/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const f = getFacility(id);
  if (!f) return res.status(404).json({ error: 'not_found' });
  res.json(f);
});

router.get('/stats', (req, res) => {
  res.json(getStats());
});

module.exports = router;
