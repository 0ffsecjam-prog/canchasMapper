# canchasMapper

App para listar y mapear **canchas y lugares para hacer deporte en el AMBA**
(CABA + Gran Buenos Aires + La Plata): canchas de fútbol, pádel, tenis, hockey,
rugby, básquet, vóley, golf, natatorios, gimnasios, polideportivos, clubes,
estadios, bowling, salones de pool y ping pong, polígonos de tiro, skate parks,
karting, paintball, etc.

## Características

- 🗺️ **Múltiples motores de mapa** (no sólo Google Maps): OpenStreetMap, Carto
  Claro/Oscuro, Esri Satélite, OpenTopoMap. Google Maps opcional con tu API key.
- 🧭 **Múltiples fuentes de datos**:
  - **OpenStreetMap (Overpass API)** — gratis, sin key, corre automáticamente
    al primer arranque.
  - **Google Places** — opcional, requiere tu server key. Más fotos y datos.
- 🏘️ **Filtro por zona**: barrios de CABA y partidos del GBA. Multi-selección.
  Se computa point-in-polygon contra los límites administrativos de OSM.
- 🗺️ **Overlay de límites**: toggle para dibujar el contorno de partidos y
  barrios sobre el mapa (Vicente López, Olivos, Palermo, etc.). Clickeable
  para filtrar.
- 🏷️ **Categorización automática**:
  - **Tipo de lugar**: estadio, club, complejo deportivo, complejo techado,
    cancha techada / semi techada / libre, gimnasio, natatorio, etc.
  - **Tamaño**: chica / mediana / grande (por área o heurísticas).
  - **Deporte/Actividad**: 60+ categorías (fútbol, pádel, tenis, hockey,
    rugby, golf, bowling, pool, ping pong, tiro federal, paintball,
    escalada, artes marciales, **zumba, pilates, yoga, crossfit, spinning,
    baile, ballet**, etc).
- 🔍 **Búsqueda inteligente** insensible a mayúsculas y acentos
  (`futbol` matchea `Fútbol`), atraviesa nombre + dirección + sport + tags.
- 📸 **Fotos** desde OSM/Wikimedia Commons (gratis) y Google Places (con key).
- 🔒 **Panel admin** en `/admin` para configurar API keys, lanzar syncs
  manuales y monitorear el estado.

## Cómo correrlo

Requiere Docker y docker-compose. En la raíz del repo:

```bash
sudo docker-compose up --build
```

Luego abrí http://localhost:8080.

En el **primer arranque** la app dispara automáticamente un sync de OSM para
todo el AMBA en background; las canchas aparecen progresivamente en el mapa
(podés refrescar pasados unos minutos para ver todo). Los datos quedan
persistidos en `./data/canchasmapper.db` (SQLite).

### Panel admin

- URL: http://localhost:8080/admin
- Password por defecto: `admin1234` (cambialo desde el panel o vía la variable
  de entorno `ADMIN_PASSWORD`).

Desde el panel podés:
- Pegar tu **API key de Google Maps** (browser key + server key de Places).
- Elegir el motor de mapa por defecto.
- Lanzar/relanzar el sync de OSM o de Google.
- Ver estadísticas y el historial de sincronizaciones.
- Cambiar la contraseña.

### Variables de entorno

| Variable          | Default                     | Descripción                       |
|-------------------|-----------------------------|-----------------------------------|
| `PORT`            | `3000` (dentro del container) | Puerto del backend.              |
| `ADMIN_PASSWORD`  | `admin1234`                 | Password inicial del admin.       |
| `SESSION_SECRET`  | `cambiame-en-produccion`    | Secret de cookies de sesión.      |
| `DATA_DIR`        | `/app/data`                 | Carpeta donde se guarda el SQLite.|

Podés crear un archivo `.env` en la raíz del repo:

```env
ADMIN_PASSWORD=miPasswordFuerte
SESSION_SECRET=algun-secret-largo-random
```

## Stack

- **Backend**: Node 20 + Express + better-sqlite3 + express-session + bcryptjs.
- **Frontend**: vanilla JS + Leaflet 1.9 + leaflet.markercluster (sin build
  step). El mapa funciona sin claves de Google.
- **Persistencia**: SQLite en `/app/data` (volumen montado a `./data`).

## Endpoints

- `GET  /api/facilities?bbox=&types=&sizes=&sports=&zones=&q=&limit=` —
  listar canchas. `zones=id1,id2,...` filtra por zona.
- `GET  /api/facilities/:id` — detalle, incluye fotos y zonas asignadas.
- `GET  /api/stats` — totales y top deportes.
- `GET  /api/zones` — todos los barrios CABA y partidos GBA disponibles.
- `GET  /api/zones/geometry` — FeatureCollection simplificado para overlay.
- `GET  /api/zones/:id/geometry` — geometría sin simplificar.
- `GET  /api/admin/public-settings` — settings públicas.
- `POST /api/admin/login` — `{ password }`.
- `POST /api/admin/logout`.
- `GET  /api/admin/settings` — settings privadas (requiere login).
- `POST /api/admin/settings`.
- `POST /api/admin/sync/:source` — `osm`, `google` o `zones`.
- `POST /api/admin/reassign-zones` — recalcular qué zona corresponde a cada
  facility por point-in-polygon.
- `GET  /api/admin/sync/status` — estado actual + estadísticas + últimos
  syncs.
- `GET  /api/admin/photo?ref=...` — proxy de fotos de Google Places.

## Bounding box AMBA

Por defecto cubre el rectángulo `S=-34.92, W=-58.75, N=-34.30, E=-58.25`
(de Tigre/Pilar a La Plata, de Lomas/Ezeiza al Río de la Plata). Para ajustarlo
editá `AMBA_BBOX` en `backend/sources/osm.js`.

## Categorización: deportes y actividades soportadas

`futbol`, `futsal`, `futbol_americano`, `tenis`, `padel`, `basquet`, `voley`,
`beach_voley`, `hockey`, `hockey_hielo`, `hockey_patines`, `rugby`, `golf`,
`minigolf`, `natacion`, `waterpolo`, `clavados`, `surf`, `kitesurf`, `remo`,
`canotaje`, `vela`, `atletismo`, `running`, `ciclismo`, `bmx`, `skate`,
`patinaje`, `patinaje_hielo`, `tiro`, `tiro_con_arco`, `artes_marciales`,
`boxeo`, `lucha`, `fitness`, `gimnasia`, `yoga`, `pilates`, `zumba`,
`crossfit`, `spinning`, `aerobica`, `baile`, `ballet`, `escalada`, `bowling`,
`bochas`, `pool`, `ping_pong`, `ajedrez`, `baseball`, `softball`, `cricket`,
`equitacion`, `turf`, `automovilismo`, `karting`, `motocross`, `paintball`,
`airsoft`, `esgrima`, `handball`, `beach_handball`, `badminton`, `squash`,
`racquetball`, `multideporte`.

## Notas

- El sync de OSM tarda 1-3 minutos (depende del endpoint de Overpass).
- El sync de zonas (admin_level 8 y 10 de AMBA) tarda 1-2 minutos extra.
- El sync de Google consume cuota: revisá tu billing.
- Si el sync inicial falla por timeout/Overpass caído, relanzalo desde
  `/admin` con los botones "Sincronizar OSM" y "Sincronizar zonas".
- Después de sincronizar zonas, las facilities existentes se reasignan
  automáticamente. Si querés forzarlo, usá "Reasignar facilities a zonas".

### Por qué buscar "zumba" puede mostrar pocos resultados

OpenStreetMap mapea principalmente *infraestructura deportiva* (canchas,
estadios, clubes), no clases o disciplinas. Si querés cobertura tipo
Google Maps para zumba, yoga, pilates, crossfit, etc., habilitá el sync de
**Google Places** desde el panel admin: incluye queries específicas en
castellano para esas actividades.
