const express = require('express');
const ExcelJS = require('exceljs');
const { listFacilitiesForExport } = require('../db');
const L = require('../utils/labels');

const router = express.Router();

function parseFilters(req) {
  return {
    types: req.query.types ? String(req.query.types).split(',').filter(Boolean) : null,
    sizes: req.query.sizes ? String(req.query.sizes).split(',').filter(Boolean) : null,
    sports: req.query.sports ? String(req.query.sports).split(',').filter(Boolean) : null,
    zones: req.query.zones ? String(req.query.zones).split(',').map(Number).filter(n => !isNaN(n)) : null,
    q: req.query.q,
    bbox: req.query.bbox,
    limit: req.query.limit || 20000
  };
}

function filtersSummary(req, count) {
  const parts = [];
  if (req.query.q) parts.push(`búsqueda: "${req.query.q}"`);
  if (req.query.types) parts.push(`tipos: ${req.query.types}`);
  if (req.query.sizes) parts.push(`tamaños: ${req.query.sizes}`);
  if (req.query.sports) parts.push(`deportes: ${req.query.sports}`);
  if (req.query.zoneNames) parts.push(`zonas: ${req.query.zoneNames}`);
  const filterText = parts.length ? parts.join(' · ') : 'sin filtros (todo)';
  return { filterText, count };
}

function absolutePhoto(url, req) {
  if (!url) return null;
  if (/^https?:\/\//.test(url)) return url;
  return `${req.protocol}://${req.get('host')}${url}`;
}

// ===== Excel =====
router.get('/xlsx', async (req, res) => {
  try {
    const filters = parseFilters(req);
    const facilities = listFacilitiesForExport(filters);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'canchasMapper';
    wb.created = new Date();

    const ws = wb.addWorksheet('Canchas', {
      views: [{ state: 'frozen', ySplit: 1 }]
    });

    const columns = [
      { header: '#', key: 'idx', width: 5 },
      { header: 'Nombre', key: 'name', width: 38 },
      { header: 'Tipo', key: 'type', width: 20 },
      { header: 'Tamaño', key: 'size', width: 10 },
      { header: 'Deportes / Actividades', key: 'sports', width: 34 },
      { header: 'Dirección / Calle', key: 'address', width: 34 },
      { header: 'Barrio / Comuna', key: 'barrio', width: 22 },
      { header: 'Partido', key: 'partido', width: 20 },
      { header: 'Latitud', key: 'lat', width: 12 },
      { header: 'Longitud', key: 'lng', width: 12 },
      { header: 'Teléfono', key: 'phone', width: 16 },
      { header: 'Web', key: 'website', width: 28 },
      { header: 'Horarios', key: 'hours', width: 22 },
      { header: 'Fuente', key: 'source', width: 9 },
      { header: 'Cómo llegar (Google)', key: 'gmaps', width: 22 },
      { header: 'Ver en OSM', key: 'osm', width: 18 }
    ];
    ws.columns = columns;

    // Estilo header
    const header = ws.getRow(1);
    header.height = 22;
    header.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF161E29' } };
      cell.font = { color: { argb: 'FFFFFFFF' }, bold: true, size: 11 };
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FF2A3645' } } };
    });

    facilities.forEach((f, i) => {
      const gmaps = `https://www.google.com/maps/dir/?api=1&destination=${f.lat},${f.lng}`;
      const osm = `https://www.openstreetmap.org/?mlat=${f.lat}&mlon=${f.lng}#map=18/${f.lat}/${f.lng}`;
      const row = ws.addRow({
        idx: i + 1,
        name: f.name || '(sin nombre)',
        type: L.typeLabel(f.type),
        size: L.sizeLabel(f.size),
        sports: L.sportsLabels(f.sports).join(', '),
        address: f.address || '',
        barrio: (f.barrios || []).join(', '),
        partido: (f.partidos || []).join(', '),
        lat: f.lat,
        lng: f.lng,
        phone: f.phone || '',
        website: f.website || '',
        hours: f.opening_hours || '',
        source: (f.source || '').toUpperCase(),
        gmaps: { text: 'Ir', hyperlink: gmaps },
        osm: { text: 'Mapa', hyperlink: osm }
      });

      // Color de la celda Tipo según categoría
      const typeCell = row.getCell('type');
      const color = L.typeColor(f.type);
      typeCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + color } };
      typeCell.font = { color: { argb: 'FF0B0F14' }, bold: true };

      // Coordenadas con decimales
      row.getCell('lat').numFmt = '0.000000';
      row.getCell('lng').numFmt = '0.000000';

      // Links en color
      ['gmaps', 'osm'].forEach(k => {
        row.getCell(k).font = { color: { argb: 'FF1D4ED8' }, underline: true };
      });
      if (f.website) {
        row.getCell('website').value = { text: f.website, hyperlink: f.website };
        row.getCell('website').font = { color: { argb: 'FF1D4ED8' }, underline: true };
      }

      // Zebra striping
      if (i % 2 === 1) {
        row.eachCell({ includeEmpty: true }, (cell, col) => {
          if (col === 3) return; // no pisar el color de tipo
          if (!cell.fill || cell.fill.type !== 'pattern') {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F6F8' } };
          }
        });
      }
    });

    ws.autoFilter = { from: 'A1', to: 'P1' };

    // === Hoja Resumen ===
    const sum = wb.addWorksheet('Resumen');
    sum.columns = [
      { header: 'Categoría', key: 'cat', width: 28 },
      { header: 'Valor', key: 'val', width: 26 },
      { header: 'Cantidad', key: 'count', width: 12 }
    ];
    sum.getRow(1).eachCell(c => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF161E29' } };
      c.font = { color: { argb: 'FFFFFFFF' }, bold: true };
    });
    const countBy = (arr, keyFn) => {
      const m = new Map();
      for (const f of arr) {
        const ks = keyFn(f);
        for (const k of (Array.isArray(ks) ? ks : [ks])) {
          if (k == null || k === '') continue;
          m.set(k, (m.get(k) || 0) + 1);
        }
      }
      return [...m.entries()].sort((a, b) => b[1] - a[1]);
    };
    sum.addRow({ cat: 'TOTAL', val: '', count: facilities.length });
    sum.addRow({});
    for (const [t, c] of countBy(facilities, f => f.type)) {
      const r = sum.addRow({ cat: 'Tipo', val: L.typeLabel(t), count: c });
      r.getCell('val').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + L.typeColor(t) } };
    }
    sum.addRow({});
    for (const [t, c] of countBy(facilities, f => f.size)) sum.addRow({ cat: 'Tamaño', val: L.sizeLabel(t), count: c });
    sum.addRow({});
    for (const [t, c] of countBy(facilities, f => f.sports)) sum.addRow({ cat: 'Deporte', val: L.sportLabel(t), count: c });
    sum.addRow({});
    for (const [t, c] of countBy(facilities, f => f.partidos)) sum.addRow({ cat: 'Partido', val: t, count: c });

    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="canchas_amba_${stamp}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== HTML autocontenido con mapa Leaflet =====
router.get('/html', (req, res) => {
  try {
    const filters = parseFilters(req);
    const facilities = listFacilitiesForExport(filters);
    const { filterText } = filtersSummary(req, facilities.length);

    const points = facilities.map(f => ({
      n: f.name || '(sin nombre)',
      t: f.type,
      tl: L.typeLabel(f.type),
      s: f.size,
      sp: L.sportsLabels(f.sports),
      a: f.address || '',
      la: f.lat,
      lo: f.lng,
      b: (f.barrios || []).join(', '),
      p: (f.partidos || []).join(', '),
      ph: f.phone || '',
      w: f.website || '',
      img: absolutePhoto(f.photo_url, req)
    }));

    const title = req.query.title || 'canchasMapper · export';
    const html = renderHtml(title, filterText, points, L.TYPE_COLORS, L.TYPE_LABELS);
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (req.query.inline !== '1') {
      res.setHeader('Content-Disposition', `attachment; filename="canchas_amba_${stamp}.html"`);
    }
    res.send(html);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function renderHtml(title, filterText, points, typeColors, typeLabels) {
  const dataJson = JSON.stringify(points);
  const colorsJson = JSON.stringify(typeColors);
  const labelsJson = JSON.stringify(typeLabels);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css">
<link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css">
<style>
  html,body{margin:0;height:100%;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
  #bar{position:fixed;top:0;left:0;right:0;height:auto;z-index:1000;background:#161e29;color:#e6edf3;padding:8px 14px;box-shadow:0 2px 8px rgba(0,0,0,.3)}
  #bar h1{margin:0;font-size:15px;display:inline-block}
  #bar .sub{font-size:12px;color:#9aa9bb;margin-left:8px}
  #legend{position:fixed;bottom:16px;right:16px;z-index:1000;background:rgba(22,30,41,.92);color:#e6edf3;border-radius:8px;padding:10px 12px;font-size:12px;max-height:50vh;overflow:auto}
  #legend .row{display:flex;align-items:center;gap:6px;margin:2px 0}
  #legend .dot{width:12px;height:12px;border-radius:50%;border:1px solid #0f1419}
  #map{position:absolute;top:42px;bottom:0;left:0;right:0}
  .popup h3{margin:0 0 4px}
  .popup .meta{color:#555;font-size:12px}
  .popup .tag{display:inline-block;background:#eef;border-radius:10px;padding:1px 7px;margin:2px 2px 0 0;font-size:11px}
  .popup img{width:100%;max-height:120px;object-fit:cover;border-radius:6px;margin-top:6px}
  .popup a{color:#1d4ed8}
</style>
</head>
<body>
<div id="bar">
  <h1>${esc(title)}</h1>
  <span class="sub">${esc(filterText)} — <b id="count">0</b> lugares · generado por canchasMapper</span>
</div>
<div id="map"></div>
<div id="legend"><b>Tipos</b><div id="legend-rows"></div></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script src="https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js"></script>
<script>
const DATA = ${dataJson};
const COLORS = ${colorsJson};
const TYPE_LABELS = ${labelsJson};
const map = L.map('map').setView([-34.6037,-58.4416], 11);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:19, attribution:'© OpenStreetMap contributors'}).addTo(map);
const cluster = L.markerClusterGroup({chunkedLoading:true, showCoverageOnHover:false, maxClusterRadius:50});
function icon(t){
  const c = COLORS[t] || '94A3B8';
  return L.divIcon({className:'', html:'<div style="width:14px;height:14px;background:#'+c+';border:2px solid #0f1419;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,.5)"></div>', iconSize:[14,14], iconAnchor:[7,7]});
}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
const bounds=[];
DATA.forEach(p=>{
  if(typeof p.la!=='number'||typeof p.lo!=='number')return;
  const m=L.marker([p.la,p.lo],{icon:icon(p.t)});
  const gm='https://www.google.com/maps/dir/?api=1&destination='+p.la+','+p.lo;
  let html='<div class="popup"><h3>'+esc(p.n)+'</h3>';
  html+='<div class="meta">'+esc(p.tl||p.t)+(p.s?' · '+esc(p.s):'')+'</div>';
  if(p.sp&&p.sp.length)html+='<div>'+p.sp.map(s=>'<span class="tag">'+esc(s)+'</span>').join('')+'</div>';
  if(p.a)html+='<div class="meta">📍 '+esc(p.a)+'</div>';
  if(p.b)html+='<div class="meta">🏘️ '+esc(p.b)+'</div>';
  if(p.p)html+='<div class="meta">🗺️ '+esc(p.p)+'</div>';
  if(p.ph)html+='<div class="meta">📞 '+esc(p.ph)+'</div>';
  if(p.w)html+='<div class="meta">🌐 <a href="'+esc(p.w)+'" target="_blank">'+esc(p.w)+'</a></div>';
  html+='<div class="meta">📌 '+p.la.toFixed(6)+', '+p.lo.toFixed(6)+'</div>';
  if(p.img)html+='<img src="'+esc(p.img)+'" onerror="this.style.display=\\'none\\'">';
  html+='<div style="margin-top:6px"><a href="'+gm+'" target="_blank">Cómo llegar ↗</a></div></div>';
  m.bindPopup(html);
  cluster.addLayer(m);
  bounds.push([p.la,p.lo]);
});
map.addLayer(cluster);
if(bounds.length)map.fitBounds(bounds,{padding:[30,30]});
document.getElementById('count').textContent=DATA.length;
// Legend
const used={};DATA.forEach(p=>used[p.t]=true);
const lr=document.getElementById('legend-rows');
Object.keys(used).forEach(t=>{
  const c=COLORS[t]||'94A3B8';
  const row=document.createElement('div');row.className='row';
  row.innerHTML='<span class="dot" style="background:#'+c+'"></span>'+esc(TYPE_LABELS[t]||t);
  lr.appendChild(row);
});
</script>
</body>
</html>`;
}

module.exports = router;
