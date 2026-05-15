// ═══════════════════════════════════════════════════════════════════════
//  humo.js  —  Simulación de Humo HYSPLIT (NOAA)
//  Depende de: Leaflet (ya cargado en index.html)
// ═══════════════════════════════════════════════════════════════════════

// URL del servidor de simulación.
// En desarrollo apunta a localhost; en producción cambiar por la URL de Railway:
//   const HUMO_BASE = 'https://TU-SERVICIO.up.railway.app';
const HUMO_BASE   = 'https://dashboard-rdcft-production.up.railway.app';
const HUMO_API    = `${HUMO_BASE}/api/simular-humo`;
const HUMO_HEALTH = `${HUMO_BASE}/api/health`;

let humoMap            = null;
let humoMarcador       = null;
let humoCapaActual     = 'mapa';
let humoCapaMapa       = null;
let humoCapaSat        = null;
let humoCapaEtiq       = null;
let humoCapaPredios      = null;
let humoPrediosVisible   = true;
let humoCapaTrayectoria  = null;
let humoIniciado         = false;
let humoServidor   = null;    // null=desconocido, true=online, false=offline
let humoHealthTimer = null;   // intervalo de reintento de health check

const MENSAJES_CARGA = [
  '⏳ Conectando con servidores NOAA HYSPLIT...',
  '🌍 Configurando modelo meteorológico GFS Global...',
  '📡 Calculando trayectorias Ensemble...',
  '🗺️ Generando archivo KMZ con resultado...',
  '⏳ El servidor NOAA está procesando (puede tardar hasta 2 min)...',
  '📡 Esperando respuesta del servidor...',
];

// ── Estado del servidor ───────────────────────────────────────────────
function setServidorOnline(online) {
  if (humoServidor === online) return;
  humoServidor = online;

  const banner = document.getElementById('humoServerBanner');
  const btn    = document.getElementById('btnSimular');

  if (online) {
    banner.style.display = 'none';
    clearInterval(humoHealthTimer);
    humoHealthTimer = setInterval(checkServidorHealth, 30000);
  } else {
    banner.style.display = 'flex';
    // Polling cada 5 s para detectar cuando arranca
    clearInterval(humoHealthTimer);
    humoHealthTimer = setInterval(checkServidorHealth, 5000);
  }
}

async function checkServidorHealth() {
  try {
    const resp = await fetch(HUMO_HEALTH, { signal: AbortSignal.timeout(8000) });
    setServidorOnline(resp.ok);
  } catch {
    setServidorOnline(false);
  }
}

// ── Inicializar mapa de humo ──────────────────────────────────────────
function initHumoMap() {
  if (humoIniciado) {
    setTimeout(() => humoMap && humoMap.invalidateSize(), 100);
    return;
  }

  humoMap = L.map('humoMapContainer', {
    center: [-37.45, -73.35],
    zoom: 9,
    minZoom: 7,
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

  // ── Capa predios Arauco ─────────────────────────────────────────────
  const renderHumoPredios = (data) => {
    const btn = document.getElementById('hBtnPredios');
    if (btn) btn.textContent = '🟧 Predios';
    humoCapaPredios = L.geoJSON(data, {
      style: { color: '#2DB87A', weight: 1.2, opacity: 0.9, fillColor: '#2DB87A', fillOpacity: 0.12 },
      onEachFeature: function(feature, layer) {
        const nombre = feature.properties.nombre || 'Sin nombre';
        const id     = feature.properties.id || '';
        layer.bindPopup(
          `<div style="font-family:'Segoe UI',sans-serif;min-width:140px;">
            <div style="font-size:11px;font-weight:700;color:#2DB87A;margin-bottom:4px;">🌲 Predio</div>
            <div style="font-size:13px;font-weight:600;color:#f0ede6;">${nombre}</div>
            ${id ? `<div style="font-size:10px;color:#888;margin-top:3px;">ID: ${id}</div>` : ''}
          </div>`,
          { closeButton: true, maxWidth: 220 }
        );
        layer.on('mouseover', () => layer.setStyle({ fillOpacity: 0.30, weight: 2, color: '#45d490' }));
        layer.on('mouseout',  () => layer.setStyle({ fillOpacity: 0.12, weight: 1.2, color: '#2DB87A' }));
        layer.on('mousedown', (e) => L.DomEvent.stopPropagation(e));
        layer.on('touchstart', (e) => L.DomEvent.stopPropagation(e));
      }
    }).addTo(humoMap);
  };

  fetch('data/predios.geojson')
    .then(r => r.json())
    .then(data => renderHumoPredios(data))
    .catch(() => {
      const btn = document.getElementById('hBtnPredios');
      if (btn) btn.textContent = '⚠ Predios';
    });

  humoMap.on('click', function(e) {
    const lat = parseFloat(e.latlng.lat.toFixed(6));
    const lon = parseFloat(e.latlng.lng.toFixed(6));
    humoSetPunto(lat, lon);
  });

  // ── Long press sobre predios (500 ms) ──────────────────────────────
  const humoContainer = document.getElementById('humoMapContainer');
  let humoLPTimer = null;

  function humoIniciarLP(e) {
    let clientX, clientY;
    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    try {
      const rect   = humoContainer.getBoundingClientRect();
      const latlng = humoMap.containerPointToLatLng([clientX - rect.left, clientY - rect.top]);
      const lat    = parseFloat(latlng.lat.toFixed(6));
      const lon    = parseFloat(latlng.lng.toFixed(6));
      humoLPTimer  = setTimeout(() => {
        humoSetPunto(lat, lon);
        if (navigator.vibrate) navigator.vibrate(60);
      }, 500);
    } catch(_) {}
  }

  function humoCancelarLP() {
    if (humoLPTimer) { clearTimeout(humoLPTimer); humoLPTimer = null; }
  }

  humoContainer.addEventListener('mousedown',  humoIniciarLP);
  humoContainer.addEventListener('mouseup',    humoCancelarLP);
  humoContainer.addEventListener('mousemove',  humoCancelarLP);
  humoContainer.addEventListener('touchstart', humoIniciarLP,  { passive: true });
  humoContainer.addEventListener('touchend',   humoCancelarLP);
  humoContainer.addEventListener('touchmove',  humoCancelarLP, { passive: true });

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

// ── Toggle predios ────────────────────────────────────────────────────
function humoTogglePredios() {
  if (!humoCapaPredios || !humoMap) return;
  humoPrediosVisible = !humoPrediosVisible;
  if (humoPrediosVisible) {
    humoCapaPredios.addTo(humoMap);
  } else {
    humoMap.removeLayer(humoCapaPredios);
  }
  const btn = document.getElementById('hBtnPredios');
  if (btn) btn.classList.toggle('active', humoPrediosVisible);
}

// ── Fijar punto de emisión (marcador + inputs + estado botones) ───────
function humoSetPunto(lat, lon) {
  humoSetMarcador(lat, lon);
  document.getElementById('humoLat').value = lat;
  document.getElementById('humoLon').value = lon;
  document.getElementById('btnSimular').disabled = false;
  document.getElementById('btnAbrirPdfHumo').disabled = true;
  document.getElementById('humoResult').style.display = 'none';
  setHumoStatus('', '');
  mostrarHCFM(lat, lon);
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
      document.getElementById('humoLat').value = lat;
      document.getElementById('humoLon').value = lon;
      document.getElementById('btnSimular').disabled = false;
      document.getElementById('btnAbrirPdfHumo').disabled = true;
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
  limpiarTrayectorias();

  let msgIdx = 0;
  setHumoStatus('loading', MENSAJES_CARGA[0]);
  const intervalo = setInterval(() => {
    msgIdx = (msgIdx + 1) % MENSAJES_CARGA.length;
    setHumoStatus('loading', MENSAJES_CARGA[msgIdx]);
  }, 15000);

  let resuelto = false;
  try {
    const resp = await fetch(HUMO_API, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ lat, lon, altura }),
      signal:  AbortSignal.timeout(360000)   // 6 min — el stream mantiene viva la conexión
    });

    if (!resp.ok || !resp.body) {
      const msg = await resp.text().catch(() => '');
      throw new Error(msg || `HTTP ${resp.status}`);
    }

    // Leer stream SSE: el servidor envía pings cada 10 s para no cerrar la conexión
    const reader  = resp.body.getReader();
    const decoder = new TextDecoder();
    let   buffer  = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lineas = buffer.split('\n');
      buffer = lineas.pop();  // conservar línea incompleta

      for (const linea of lineas) {
        if (!linea.startsWith('data: ')) continue;
        let evento;
        try { evento = JSON.parse(linea.slice(6)); } catch { continue; }

        if (evento.tipo === 'ok') {
          resuelto = true;
          setHumoStatus('ok', '✅ Simulación completada exitosamente.');
          document.getElementById('humoDownloadLink').href = evento.url;
          document.getElementById('humoResult').style.display = 'flex';
          document.getElementById('btnAbrirPdfHumo').disabled = false;
          if (humoMarcador) humoMarcador.closePopup();
          if (evento.trayectorias) try { mostrarTrayectorias(evento.trayectorias); } catch(_) {}
          break;
        } else if (evento.tipo === 'error') {
          resuelto = true;
          setHumoStatus('error', `❌ ${evento.msg || 'La simulación falló. Intenta nuevamente.'}`);
          break;
        }
        // tipo 'ping' o 'inicio' → seguir esperando
      }

      if (resuelto) break;
    }

    if (!resuelto) {
      setHumoStatus('error', '❌ La conexión finalizó inesperadamente.');
    }

  } catch (err) {
    if (resuelto) { /* simulación ya completada — ignorar error de cierre del stream */ }
    else if (err.name === 'TimeoutError') {
      setHumoStatus('error', '❌ Tiempo de espera agotado (6 min). El servidor NOAA tardó demasiado.');
    } else {
      setServidorOnline(false);
      setHumoStatus('error', '❌ Se perdió la conexión con el servidor. Reintentando...');
    }
  } finally {
    clearInterval(intervalo);
    btn.disabled = false;
  }
}

// ── Actualizar mensaje de estado ──────────────────────────────────────
function setHumoStatus(tipo, msg) {
  const el = document.getElementById('humoStatus');
  el.textContent   = msg;
  el.className     = `humo-status humo-status--${tipo}`;
  el.style.display = msg ? 'block' : 'none';
}

// ── Trayectorias en mapa ──────────────────────────────────────────────
function limpiarTrayectorias() {
  if (humoCapaTrayectoria && humoMap) {
    humoMap.removeLayer(humoCapaTrayectoria);
    humoCapaTrayectoria = null;
  }
}

function mostrarTrayectorias(geojson) {
  if (!humoMap || !geojson || !geojson.features || !geojson.features.length) return;
  limpiarTrayectorias();

  try {
    humoCapaTrayectoria = L.geoJSON(geojson, {
      interactive: false,
      style: function(feature) {
        return {
          color:   feature.properties.color || '#FF8C00',
          weight:  1.8,
          opacity: 0.75
        };
      },
      pointToLayer: function() { return null; }
    }).addTo(humoMap);

    const bounds = humoCapaTrayectoria.getBounds();
    if (bounds.isValid()) {
      humoMap.fitBounds(bounds, { padding: [40, 40] });
      if (humoMap.getZoom() < 9) {
        const lat = parseFloat(document.getElementById('humoLat')?.value);
        const lon = parseFloat(document.getElementById('humoLon')?.value);
        const centro = (lat && lon) ? [lat, lon] : bounds.getCenter();
        humoMap.setView(centro, 9, { animate: true });
      }
    }
  } catch(_) {}
}

// ── Modal PDF ─────────────────────────────────────────────────────────
function abrirModalPdfHumo() {
  const lat = document.getElementById('humoLat').value;
  const lon = document.getElementById('humoLon').value;
  if (!lat || !lon) {
    setHumoStatus('error', '❌ Selecciona un punto en el mapa primero.');
    return;
  }
  document.getElementById('pdfNombre').value = '';
  document.getElementById('humoPdfModal').style.display = 'flex';
  generarComentariosAuto(parseFloat(lat), parseFloat(lon));
}

async function generarComentariosAuto(lat, lon) {
  const txtViento = document.getElementById('pdfComentViento');
  const txtQuema  = document.getElementById('pdfComentQuema');
  const btnGen    = document.getElementById('btnGenerarPdf');

  txtViento.value    = '⏳ Consultando pronóstico meteorológico...';
  txtQuema.value     = '⏳ Evaluando condiciones operacionales...';
  txtViento.disabled = true;
  txtQuema.disabled  = true;
  btnGen.disabled    = true;

  const DIAS_ES   = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
  const MESES_ES  = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  const fmtFecha  = s => { const d = new Date(s + 'T12:00:00'); return `${DIAS_ES[d.getDay()]} ${d.getDate()} ${MESES_ES[d.getMonth()]}`; };

  try {
    const raw  = await fetchWeather(lat, lon);
    const days = parseHourly(raw);
    const slots = days.flatMap(d => d.slots);

    // ── Análisis de viento ────────────────────────────────────────
    const vAvg    = Math.round(slots.reduce((a, s) => a + s.viento, 0) / slots.length);
    const vMax    = Math.max(...slots.map(s => s.viento));
    const rMax    = Math.max(...slots.map(s => s.racha));
    const dirAvg  = Math.round(slots.reduce((a, s) => a + s.direccion, 0) / slots.length);
    const dirLabel = compassLabel(dirAvg);

    const diasOkViento  = days.filter(d => d.slots.every(s => s.viento <= VIENTO_LIMITE_RDCFT));
    const diasMarViento = days.filter(d => d.slots.some(s => s.viento > VIENTO_LIMITE_RDCFT));

    let textoViento = `Pronóstico para los próximos ${days.length} días (Open-Meteo):\n`;
    textoViento += `• Viento promedio: ${vAvg} km/h — rachas máximas: ${rMax} km/h\n`;
    textoViento += `• Dirección predominante: ${dirLabel} (${dirAvg}°)\n`;

    if (diasOkViento.length > 0) {
      textoViento += `• Días dentro del límite (≤${VIENTO_LIMITE_RDCFT} km/h): ${diasOkViento.map(d => fmtFecha(d.date)).join(', ')}\n`;
    }
    if (diasMarViento.length > 0) {
      const detalle = diasMarViento.map(d => {
        const mx = Math.max(...d.slots.map(s => s.viento));
        return `${fmtFecha(d.date)} (máx. ${mx} km/h)`;
      }).join(', ');
      textoViento += `• Días con viento sobre el límite: ${detalle}`;
    }

    // ── Evaluación operacional RDCFT ──────────────────────────────
    const nOk   = days.filter(d => estadoDia(d) === 'ok').length;
    const nWarn = days.filter(d => estadoDia(d) === 'warn').length;
    const nBad  = days.filter(d => estadoDia(d) === 'bad').length;

    let estadoGlobal;
    if (nOk >= 5)              estadoGlobal = 'FAVORABLE — condiciones aptas para la operación';
    else if (nOk + nWarn >= 4) estadoGlobal = 'CON RESTRICCIONES — operar en ventanas horarias favorables';
    else                       estadoGlobal = 'NO FAVORABLE — viento no permite operar con seguridad';

    const mejorDia = days.find(d => estadoDia(d) === 'ok');
    const ventana  = mejorDia
      ? `Ventana óptima: ${fmtFecha(mejorDia.date)} — horarios operables: ${mejorDia.slots.filter(s => s.rdcft.operable).map(s => s.hora).join(', ')}.`
      : 'No se identifican ventanas completamente favorables en el período consultado.';

    let textoQuema = `Evaluación RDCFT — límite viento ≤${VIENTO_LIMITE_RDCFT} km/h:\n`;
    textoQuema += `Estado general: ${estadoGlobal}\n\n`;
    textoQuema += `• Días completamente favorables: ${nOk}/${days.length}\n`;
    textoQuema += `• Días con restricciones parciales: ${nWarn}/${days.length}\n`;
    textoQuema += `• Días no operables: ${nBad}/${days.length}\n\n`;
    textoQuema += ventana;

    txtViento.value = textoViento;
    txtQuema.value  = textoQuema;

  } catch {
    txtViento.value = 'No se pudo obtener el pronóstico meteorológico para este punto.';
    txtQuema.value  = 'No se pudo evaluar las condiciones operacionales.';
  } finally {
    txtViento.disabled = false;
    txtQuema.disabled  = false;
    btnGen.disabled    = false;
  }
}

function cerrarModalPdfHumo() {
  document.getElementById('humoPdfModal').style.display = 'none';
}

async function generarPdfHumo() {
  const lat         = document.getElementById('humoLat').value;
  const lon         = document.getElementById('humoLon').value;
  const altura      = document.getElementById('humoAltura').value || '500';
  const nombre      = (document.getElementById('pdfNombre').value || '').trim();
  const comentViento = document.getElementById('pdfComentViento').value.trim();
  const comentQuema  = document.getElementById('pdfComentQuema').value.trim();
  const kmzHref     = document.getElementById('humoDownloadLink').href;

  const btn = document.getElementById('btnGenerarPdf');
  btn.textContent = '⏳ Generando...';
  btn.disabled    = true;

  const esIOS      = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const ventanaIOS = esIOS ? window.open('', '_blank') : null;

  try {
    // ── 1. Capturar mapa ──────────────────────────────────────────
    let mapImgData = null;
    try {
      const mapEl = document.getElementById('humoMapContainer');
      if (mapEl && humoMap) {
        const capLat = parseFloat(document.getElementById('humoLat').value);
        const capLon = parseFloat(document.getElementById('humoLon').value);
        if (capLat && capLon) humoMap.setView([capLat, capLon], 10, { animate: false });
        humoMap.invalidateSize();
        await new Promise(r => setTimeout(r, 900));
        const mc = await html2canvas(mapEl, {
          scale: 2, useCORS: true, allowTaint: true, logging: false,
          scrollX: 0, scrollY: 0
        });
        mapImgData = mc.toDataURL('image/jpeg', 0.92);
      }
    } catch (_) {}

    // ── 2. jsPDF — Letter Portrait (215.9 × 279.4 mm) ────────────
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'mm', format: 'letter', orientation: 'portrait' });
    const pW  = pdf.internal.pageSize.getWidth();   // 215.9
    const pH  = pdf.internal.pageSize.getHeight();  // 279.4
    const ML  = 10, MR = 10;
    const CW  = pW - ML - MR;                       // 195.9

    const fecha = new Date().toLocaleDateString('es-CL',
      { day: '2-digit', month: 'long', year: 'numeric' });

    // ── Helpers internos ──────────────────────────────────────────
    const boxW = CW - 7;  // ancho de texto dentro de caja (margen acento izq)

    function boxH(texto, minH) {
      if (!texto || !texto.trim()) return minH;
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8.5);
      return Math.max(minH, pdf.splitTextToSize(texto, boxW).length * 4.5 + 10);
    }

    function drawBox(y, h) {
      pdf.setFillColor(248, 249, 250);
      pdf.setDrawColor(224, 224, 224);
      pdf.setLineWidth(0.3);
      pdf.rect(ML, y, CW, h, 'FD');
      pdf.setDrawColor(92, 184, 92);
      pdf.setLineWidth(1.2);
      pdf.line(ML + 0.6, y + 1.5, ML + 0.6, y + h - 1.5);
    }

    function drawTextInBox(y, h, texto) {
      const tx = ML + 4.5;
      if (!texto || !texto.trim()) {
        pdf.setFont('helvetica', 'italic');
        pdf.setFontSize(8.5);
        pdf.setTextColor(153, 153, 153);
        pdf.text('Sin comentarios.', tx, y + h / 2 + 1.5);
      } else {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8.5);
        pdf.setTextColor(51, 51, 51);
        pdf.text(pdf.splitTextToSize(texto, boxW), tx, y + 6, { lineHeightFactor: 1.4 });
      }
    }

    function drawLabel(y, texto) {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7);
      pdf.setTextColor(68, 68, 68);
      pdf.text(texto, ML, y);
    }

    // ── 3. HEADER ─────────────────────────────────────────────────
    // Logo "arauco" (izquierda)
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(22);
    pdf.setTextColor(170, 170, 170);
    pdf.text('arauco', ML, 21);

    // Bloque título (derecha)
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.setTextColor(34, 34, 34);
    pdf.text('Simulación de Dispersión de Humo', pW - MR, 9, { align: 'right' });

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor(102, 102, 102);
    if (nombre) {
      pdf.setFontSize(8);
      pdf.text(nombre, pW - MR, 15, { align: 'right' });
      pdf.setFontSize(7);
      pdf.text(`HYSPLIT Ensemble · Lat ${lat} · Lon ${lon} · Altura ${altura} m`, pW - MR, 20, { align: 'right' });
      pdf.text(fecha, pW - MR, 25, { align: 'right' });
    } else {
      pdf.text(`HYSPLIT Ensemble · Lat ${lat} · Lon ${lon} · Altura ${altura} m`, pW - MR, 17, { align: 'right' });
      pdf.text(fecha, pW - MR, 22, { align: 'right' });
    }

    // Línea divisora header
    pdf.setDrawColor(221, 221, 221);
    pdf.setLineWidth(0.3);
    pdf.line(ML, 28, pW - MR, 28);

    // ── 4. LABEL + MAPA ───────────────────────────────────────────
    let y = 33;
    drawLabel(y, 'PUNTO DE EMISIÓN');
    y += 3;

    const MAP_H = 70;
    if (mapImgData) {
      pdf.addImage(mapImgData, 'JPEG', ML, y, CW, MAP_H, '', 'FAST');
    } else {
      pdf.setFillColor(46, 46, 46);
      pdf.rect(ML, y, CW, MAP_H, 'F');
      pdf.setFontSize(9);
      pdf.setTextColor(136, 136, 136);
      pdf.text('Mapa no disponible', pW / 2, y + MAP_H / 2, { align: 'center' });
    }
    pdf.setDrawColor(224, 224, 224);
    pdf.setLineWidth(0.3);
    pdf.rect(ML, y, CW, MAP_H, 'S');
    y += MAP_H + 5;  // ≈ 108

    // ── 5. FILA DE COORDENADAS ─────────────────────────────────────
    const COL = CW / 3;

    function coordItem(x, colorRGB, etiq, valor) {
      pdf.setFillColor(...colorRGB);
      pdf.circle(x + 1.5, y - 1.8, 1.2, 'F');
      const iW = 4.5;
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8.5);
      pdf.setTextColor(102, 102, 102);
      pdf.text(etiq, x + iW, y);
      const eW = pdf.getTextWidth(etiq);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(34, 34, 34);
      pdf.text(valor, x + iW + eW, y);
    }

    pdf.setFont('helvetica', 'normal');
    coordItem(ML,           [217, 83, 79],   'Latitud: ',        lat);
    coordItem(ML + COL,     [217, 83, 79],   'Longitud: ',       lon);
    coordItem(ML + 2 * COL, [102, 102, 102], 'Altura emision: ', `${altura} m`);
    y += 9;  // ≈ 117

    // ── 6. CONDICIONES DE VIENTO ──────────────────────────────────
    y += 3;
    drawLabel(y, 'CONDICIONES DE VIENTO');
    y += 2;
    const hV = boxH(comentViento, 28);
    drawBox(y, hV);
    drawTextInBox(y, hV, comentViento);
    y += hV + 5;

    // ── 7. CONDICIONES PARA LA QUEMA ──────────────────────────────
    drawLabel(y, 'CONDICIONES PARA LA QUEMA');
    y += 2;
    const hQ = boxH(comentQuema, 28);
    drawBox(y, hQ);
    drawTextInBox(y, hQ, comentQuema);
    y += hQ + 5;

    // ── 8. TRAYECTORIA HYSPLIT ─────────────────────────────────────
    drawLabel(y, 'TRAYECTORIA HYSPLIT');
    y += 2;
    const TRAY_H = 22;
    drawBox(y, TRAY_H);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);
    pdf.setTextColor(51, 51, 51);
    pdf.text('Archivo KMZ disponible para visualización en Google Earth:', ML + 4.5, y + 7);

    const kmzValido = kmzHref && kmzHref !== '#' && !kmzHref.endsWith(window.location.pathname);
    if (kmzValido) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.5);
      pdf.setTextColor(46, 125, 50);
      const kmzLineas = pdf.splitTextToSize(kmzHref, boxW);
      pdf.text(kmzLineas[0], ML + 4.5, y + 14);
    }

    // ── 9. FOOTER (fijado al borde inferior) ──────────────────────
    const FOOT_Y = pH - 14;
    pdf.setDrawColor(221, 221, 221);
    pdf.setLineWidth(0.3);
    pdf.line(ML, FOOT_Y - 3, pW - MR, FOOT_Y - 3);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor(153, 153, 153);
    pdf.text('Modelo: NOAA HYSPLIT Ensemble · Meteorología: GFS Global', ML, FOOT_Y);
    pdf.text(`Generado: ${fecha}`, pW - MR, FOOT_Y, { align: 'right' });

    // ── 10. Guardar ────────────────────────────────────────────────
    const slug = (nombre || `${lat}_${lon}`).replace(/[^a-zA-Z0-9._-]/g, '_');
    const nombreArchivo = `RDCFT_Humo_${slug}_${new Date().toISOString().slice(0, 10)}.pdf`;

    if (esIOS && ventanaIOS) {
      const blobUrl = URL.createObjectURL(pdf.output('blob'));
      ventanaIOS.location.href = blobUrl;
      setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
    } else {
      if (ventanaIOS) ventanaIOS.close();
      pdf.save(nombreArchivo);
    }

    cerrarModalPdfHumo();

  } catch (err) {
    console.error('[HUMO PDF]', err);
    if (ventanaIOS) ventanaIOS.close();
    setHumoStatus('error', '❌ Error al generar el PDF.');
  } finally {
    btn.textContent = '📄 Generar PDF';
    btn.disabled    = false;
  }
}

// ── Leyenda HCFM ─────────────────────────────────────────────────────
let humoHCFMLeyenda = null;

function crearLeyendaHCFM() {
  const pos    = window.innerWidth <= 700 ? 'bottomleft' : 'bottomright';
  const leyenda = L.control({ position: pos });
  leyenda.onAdd = function() {
    const div = L.DomUtil.create('div', 'humo-hcfm-leyenda');
    div.innerHTML = `
      <table class="humo-hcfm-leyenda-tabla">
        <thead>
          <tr>
            <th>Color</th><th>Rango</th><th>Peligro</th>
          </tr>
        </thead>
        <tbody>
          <tr><td><span class="humo-hcfm-dot" style="background:#c0392b"></span>Rojo</td><td>&lt; 8%</td><td>Crítico</td></tr>
          <tr><td><span class="humo-hcfm-dot" style="background:#e67e22"></span>Naranja</td><td>8–12%</td><td>Bajo</td></tr>
          <tr><td><span class="humo-hcfm-dot" style="background:#f1c40f"></span>Amarillo</td><td>12–16%</td><td>Moderado</td></tr>
          <tr><td><span class="humo-hcfm-dot" style="background:#27ae60"></span>Verde</td><td>&gt; 20%</td><td>Alto</td></tr>
        </tbody>
      </table>
    `;
    L.DomEvent.disableClickPropagation(div);
    return div;
  };
  return leyenda;
}

// ── HCFM: interpolación IDW y gradiente de color ─────────────────────
function idwHCFM(puntos, lat, lon) {
  let num = 0, den = 0;
  for (const p of puntos) {
    const d2 = (p.lat - lat) ** 2 + (p.lon - lon) ** 2;
    if (d2 < 1e-8) return p.hcfm;
    const w  = 1 / d2;
    num += w * p.hcfm;
    den += w;
  }
  return den > 0 ? num / den : 10;
}

// Paradas de color: [valor%, R, G, B] — espejo del mapa CONAF (rojo→naranja→amarillo→verde)
const _HCFM_STOPS = [
  [0,  192, 57,  43 ],
  [8,  231, 76,  60 ],
  [12, 230, 126, 34 ],
  [16, 241, 196, 15 ],
  [20, 163, 203, 56 ],
  [25, 39,  174, 96 ],
];

function colorHCFM(hcfm) {
  const v = Math.max(0, Math.min(30, hcfm));
  const s = _HCFM_STOPS;
  for (let i = 1; i < s.length; i++) {
    if (v <= s[i][0]) {
      const t = (v - s[i-1][0]) / (s[i][0] - s[i-1][0]);
      return [
        Math.round(s[i-1][1] + t * (s[i][1] - s[i-1][1])),
        Math.round(s[i-1][2] + t * (s[i][2] - s[i-1][2])),
        Math.round(s[i-1][3] + t * (s[i][3] - s[i-1][3])),
      ];
    }
  }
  return [s[s.length-1][1], s[s.length-1][2], s[s.length-1][3]];
}

// ── L.GridLayer — renderizado canvas con gradiente suave ──────────────
const CapaHCFMLayer = L.GridLayer.extend({
  initialize: function(puntos, opciones) {
    this._puntos = puntos;
    const lats = puntos.map(p => p.lat);
    const lons  = puntos.map(p => p.lon);
    const pad   = 0.6;
    const bounds = L.latLngBounds(
      [Math.min(...lats) - pad, Math.min(...lons) - pad],
      [Math.max(...lats) + pad, Math.max(...lons) + pad]
    );
    L.GridLayer.prototype.initialize.call(this, Object.assign({ bounds, zIndex: 200 }, opciones));
  },

  createTile: function(coords) {
    const RES  = 64;   // renderiza 64×64, el browser suaviza al escalar a 256
    const tile = document.createElement('canvas');
    tile.width  = RES;
    tile.height = RES;
    tile.style.width          = '256px';
    tile.style.height         = '256px';
    tile.style.imageRendering = 'auto';

    const ctx    = tile.getContext('2d');
    const b      = this._tileCoordsToBounds(coords);
    const norte  = b.getNorth(), sur  = b.getSouth();
    const oeste  = b.getWest(),  este = b.getEast();
    const puntos = this._puntos;
    const img    = ctx.createImageData(RES, RES);

    for (let y = 0; y < RES; y++) {
      const lat = norte - (norte - sur) * (y + 0.5) / RES;
      for (let x = 0; x < RES; x++) {
        const lon       = oeste + (este - oeste) * (x + 0.5) / RES;
        const val       = idwHCFM(puntos, lat, lon);
        const [r, g, b2] = colorHCFM(val);
        const i = (y * RES + x) * 4;
        img.data[i]     = r;
        img.data[i + 1] = g;
        img.data[i + 2] = b2;
        img.data[i + 3] = 150;   // ~59% opacidad
      }
    }
    ctx.putImageData(img, 0, 0);
    return tile;
  }
});

// ── HCFM state ────────────────────────────────────────────────────────
let humoCapaHCFM    = null;
let humoHCFMVisible = true;

const HCFM_NIVELES = [
  { max: 10,       color: '#c0392b', texto: '#fff', cat: 'Crítica'  },
  { max: 15,       color: '#e67e22', texto: '#fff', cat: 'Baja'     },
  { max: 20,       color: '#f1c40f', texto: '#333', cat: 'Moderada' },
  { max: Infinity, color: '#27ae60', texto: '#fff', cat: 'Alta'     },
];

function hcfmNivel(val) {
  return HCFM_NIVELES.find(n => val < n.max) || HCFM_NIVELES[HCFM_NIVELES.length - 1];
}

function calcHCFM(temp, hr) {
  return Math.max(0, +(0.297374 + 0.262 * hr - 0.00982 * temp).toFixed(1));
}

async function fetchHCFMPunto(lat, lon) {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&hourly=temperature_2m,relativehumidity_2m&forecast_days=1&timezone=auto`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!resp.ok) throw new Error('open-meteo error');
  const data = await resp.json();
  const idx  = Math.min(new Date().getHours(), data.hourly.time.length - 1);
  const temp = data.hourly.temperature_2m[idx];
  const hr   = data.hourly.relativehumidity_2m[idx];
  return { hcfm: calcHCFM(temp, hr), temp, hr };
}

function limpiarCapaHCFM() {
  if (humoCapaHCFM && humoMap) humoMap.removeLayer(humoCapaHCFM);
  humoCapaHCFM = null;
  if (humoHCFMLeyenda && humoMap) humoHCFMLeyenda.remove();
  humoHCFMLeyenda = null;
  const panel = document.getElementById('humoHCFMPanel');
  if (panel) panel.style.display = 'none';
  const btn = document.getElementById('hBtnHCFM');
  if (btn) btn.classList.remove('active');
}

function actualizarPanelHCFM(estado, datos) {
  const panel = document.getElementById('humoHCFMPanel');
  if (!panel) return;
  panel.style.display = 'block';
  if (estado === 'loading') {
    panel.innerHTML = `<span class="humo-hcfm-cargando">⏳ Calculando humedad del combustible...</span>`;
    return;
  }
  if (estado === 'error' || !datos) {
    panel.innerHTML = `<span class="humo-hcfm-cargando" style="color:#888">⚠ Sin datos de humedad disponibles</span>`;
    return;
  }
  const n = hcfmNivel(datos.hcfm);
  panel.innerHTML = `
    <div class="humo-hcfm-header">
      <span class="humo-hcfm-titulo">🔥 Humedad Combustible Fino Muerto</span>
      <span class="humo-hcfm-badge" style="background:${n.color};color:${n.texto}">${n.cat}</span>
    </div>
    <div class="humo-hcfm-cuerpo">
      <span class="humo-hcfm-valor" style="color:${n.color}">${datos.hcfm}%</span>
      <span class="humo-hcfm-meta">T: ${datos.temp}°C &nbsp;·&nbsp; HR: ${datos.hr}%</span>
    </div>
    <div class="humo-hcfm-fuente">Calculado con Open-Meteo · Metodología</div>
  `;
}

async function cargarGridHCFM(lat, lon) {
  const PASO = 0.5;
  const N    = 3;   // 7×7 = 49 puntos, cubre ±1.5° (~330 km)
  const promesas = [];
  for (let dy = -N; dy <= N; dy++) {
    for (let dx = -N; dx <= N; dx++) {
      const pLat = +(lat + dy * PASO).toFixed(4);
      const pLon = +(lon + dx * PASO).toFixed(4);
      promesas.push(
        fetchHCFMPunto(pLat, pLon)
          .then(r => ({ lat: pLat, lon: pLon, ...r }))
          .catch(() => null)
      );
    }
  }
  const resultados = (await Promise.all(promesas)).filter(Boolean);
  return new CapaHCFMLayer(resultados);
}

function humoToggleHCFM() {
  if (!humoCapaHCFM || !humoMap) return;
  humoHCFMVisible = !humoHCFMVisible;
  if (humoHCFMVisible) {
    humoCapaHCFM.addTo(humoMap);
    if (!humoHCFMLeyenda) humoHCFMLeyenda = crearLeyendaHCFM();
    humoHCFMLeyenda.addTo(humoMap);
  } else {
    humoMap.removeLayer(humoCapaHCFM);
    if (humoHCFMLeyenda) humoHCFMLeyenda.remove();
  }
  const btn = document.getElementById('hBtnHCFM');
  if (btn) btn.classList.toggle('active', humoHCFMVisible);
}

async function mostrarHCFM(lat, lon) {
  limpiarCapaHCFM();
  actualizarPanelHCFM('loading', null);

  fetchHCFMPunto(lat, lon)
    .then(r => actualizarPanelHCFM('ok', r))
    .catch(() => actualizarPanelHCFM('error', null));

  cargarGridHCFM(lat, lon).then(layer => {
    humoCapaHCFM    = layer;
    humoHCFMVisible = true;
    if (humoMap) {
      layer.addTo(humoMap);
      humoHCFMLeyenda = crearLeyendaHCFM();
      humoHCFMLeyenda.addTo(humoMap);
    }
    const btn = document.getElementById('hBtnHCFM');
    if (btn) btn.classList.add('active');
  }).catch(() => {});
}

// ── Limpiar simulación ────────────────────────────────────────────────
function humoLimpiar() {
  limpiarTrayectorias();
  limpiarCapaHCFM();

  if (humoMarcador && humoMap) {
    humoMap.removeLayer(humoMarcador);
    humoMarcador = null;
  }

  document.getElementById('humoLat').value  = '';
  document.getElementById('humoLon').value  = '';
  document.getElementById('btnSimular').disabled        = true;
  document.getElementById('btnAbrirPdfHumo').disabled   = true;
  document.getElementById('humoResult').style.display   = 'none';
  setHumoStatus('', '');
}

// ── Llamado desde ui.js al mostrar la pestaña ────────────────────────
function onHumoTabVisible() {
  if (!humoIniciado) initHumoMap();
  else setTimeout(() => humoMap && humoMap.invalidateSize(), 150);

  // Verificar servidor inmediatamente al abrir la pestaña
  checkServidorHealth();
}
