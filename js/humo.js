// ═══════════════════════════════════════════════════════════════════════
//  humo.js  —  Simulación de Humo HYSPLIT (NOAA)
//  Depende de: Leaflet (ya cargado en index.html)
// ═══════════════════════════════════════════════════════════════════════

const HUMO_API = 'http://localhost:5001/api/simular-humo';

let humoMap        = null;
let humoMarcador   = null;
let humoCapaActual = 'mapa';
let humoCapaMapa   = null;
let humoCapaSat    = null;
let humoCapaEtiq   = null;
let humoIniciado   = false;

// Mensajes que rotan durante la espera larga del servidor NOAA
const MENSAJES_CARGA = [
  '⏳ Conectando con servidores NOAA HYSPLIT...',
  '🌍 Configurando modelo meteorológico GFS Global...',
  '📡 Calculando trayectorias Ensemble...',
  '🗺️ Generando archivo KMZ con resultado...',
  '⏳ El servidor NOAA está procesando (puede tardar hasta 2 min)...',
  '📡 Esperando respuesta del servidor...',
];

// ── Inicializar mapa de humo ──────────────────────────────────────────
function initHumoMap() {
  if (humoIniciado) {
    setTimeout(() => humoMap && humoMap.invalidateSize(), 100);
    return;
  }

  humoMap = L.map('humoMapContainer', {
    center: [-37.45, -73.35],
    zoom: 9,
    zoomControl: true,
    attributionControl: false
  });

  humoCapaMapa = L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    { maxZoom: 19, subdomains: 'abcd' }
  ).addTo(humoMap);

  humoCapaSat = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { maxZoom: 19 }
  );

  humoCapaEtiq = L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png',
    { maxZoom: 19, subdomains: 'abcd', pane: 'overlayPane' }
  );

  // Clic en mapa → colocar marcador y habilitar botón
  humoMap.on('click', function(e) {
    const lat = parseFloat(e.latlng.lat.toFixed(6));
    const lon = parseFloat(e.latlng.lng.toFixed(6));
    humoSetMarcador(lat, lon);
    document.getElementById('humoLat').value = lat;
    document.getElementById('humoLon').value = lon;
    document.getElementById('btnSimular').disabled = false;
  });

  humoIniciado = true;
  setTimeout(() => humoMap && humoMap.invalidateSize(), 200);
}

// ── Cambiar capa base ─────────────────────────────────────────────────
function humoSetCapa(modo) {
  if (!humoMap) return;
  humoCapaActual = modo;
  if (modo === 'satelite') {
    humoMap.removeLayer(humoCapaMapa);
    humoCapaSat.addTo(humoMap);
    humoCapaEtiq.addTo(humoMap);
  } else {
    if (humoCapaSat)  humoMap.removeLayer(humoCapaSat);
    if (humoCapaEtiq) humoMap.removeLayer(humoCapaEtiq);
    humoCapaMapa.addTo(humoMap);
  }
  document.getElementById('hBtnMapa').classList.toggle('active', modo === 'mapa');
  document.getElementById('hBtnSatelite').classList.toggle('active', modo === 'satelite');
}

// ── Colocar marcador naranja ──────────────────────────────────────────
function humoSetMarcador(lat, lon) {
  const icono = L.divIcon({
    className: '',
    html: `<div style="
      width:16px;height:16px;
      background:#E8820A;
      border:2.5px solid #fff;
      border-radius:50%;
      box-shadow:0 0 10px rgba(232,130,10,0.9);
    "></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  });
  if (humoMarcador) {
    humoMarcador.setLatLng([lat, lon]);
  } else {
    humoMarcador = L.marker([lat, lon], { icon: icono }).addTo(humoMap);
  }
  humoMarcador
    .bindPopup(`<b style="color:#E8820A">Punto de emisión<br>${lat}, ${lon}</b>`, { closeButton: false })
    .openPopup();
}

// ── Geolocalización ───────────────────────────────────────────────────
function humoGeolocate() {
  const btn = document.getElementById('hBtnGeo');
  if (!navigator.geolocation) return;
  btn.textContent = '⏳';
  btn.disabled    = true;

  navigator.geolocation.getCurrentPosition(
    function(pos) {
      const lat = parseFloat(pos.coords.latitude.toFixed(6));
      const lon = parseFloat(pos.coords.longitude.toFixed(6));
      if (!humoIniciado) initHumoMap();
      humoMap.setView([lat, lon], 13);
      humoSetMarcador(lat, lon);
      document.getElementById('humoLat').value        = lat;
      document.getElementById('humoLon').value        = lon;
      document.getElementById('btnSimular').disabled  = false;
      btn.textContent = '📍';
      btn.disabled    = false;
    },
    function() {
      btn.textContent = '📍';
      btn.disabled    = false;
    },
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
  );
}

// ── Ejecutar simulación ───────────────────────────────────────────────
async function ejecutarSimulacion() {
  const lat    = parseFloat(document.getElementById('humoLat').value);
  const lon    = parseFloat(document.getElementById('humoLon').value);
  const altura = parseInt(document.getElementById('humoAltura').value) || 500;

  if (isNaN(lat) || isNaN(lon)) {
    setHumoStatus('error', '❌ Selecciona un punto en el mapa primero.');
    return;
  }

  const btn = document.getElementById('btnSimular');
  btn.disabled = true;
  document.getElementById('humoResult').style.display = 'none';

  // Rotar mensajes mientras el servidor NOAA procesa
  let msgIdx = 0;
  setHumoStatus('loading', MENSAJES_CARGA[0]);
  const intervalo = setInterval(() => {
    msgIdx = (msgIdx + 1) % MENSAJES_CARGA.length;
    setHumoStatus('loading', MENSAJES_CARGA[msgIdx]);
  }, 15000);

  try {
    const resp = await fetch(HUMO_API, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ lat, lon, altura }),
      signal:  AbortSignal.timeout(180000)  // 3 min máximo
    });

    const data = await resp.json();

    if (data.url) {
      setHumoStatus('ok', '✅ Simulación completada exitosamente.');
      document.getElementById('humoDownloadLink').href = data.url;
      document.getElementById('humoResult').style.display = 'flex';
    } else {
      setHumoStatus('error', `❌ ${data.error || 'La simulación falló. Intenta nuevamente.'}`);
    }

  } catch (err) {
    if (err.name === 'TimeoutError') {
      setHumoStatus('error', '❌ Tiempo de espera agotado. El servidor NOAA tardó más de 3 minutos.');
    } else {
      setHumoStatus('error', '❌ No se pudo conectar al servidor. ¿Está corriendo server.py?');
    }
  } finally {
    clearInterval(intervalo);
    btn.disabled = false;
  }
}

// ── Actualizar mensaje de estado ──────────────────────────────────────
function setHumoStatus(tipo, msg) {
  const el = document.getElementById('humoStatus');
  el.textContent = msg;
  el.className   = `humo-status humo-status--${tipo}`;
  el.style.display = msg ? 'block' : 'none';
}

// ── Inicializar mapa al mostrar la pestaña por primera vez ────────────
//    Llamado desde switchSidebarTab en ui.js
function onHumoTabVisible() {
  if (!humoIniciado) {
    initHumoMap();
  } else {
    setTimeout(() => humoMap && humoMap.invalidateSize(), 150);
  }
}
