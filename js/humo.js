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
let humoCapaPredios    = null;
let humoPrediosVisible = true;
let humoIniciado       = false;
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
    humoSetMarcador(lat, lon);
    document.getElementById('humoLat').value = lat;
    document.getElementById('humoLon').value = lon;
    document.getElementById('btnSimular').disabled = false;
    document.getElementById('btnAbrirPdfHumo').disabled = true; // espera simulación
    document.getElementById('humoResult').style.display = 'none';
    setHumoStatus('', '');
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
      signal:  AbortSignal.timeout(180000)
    });

    const data = await resp.json();

    if (data.url) {
      setHumoStatus('ok', '✅ Simulación completada exitosamente.');
      document.getElementById('humoDownloadLink').href = data.url;
      document.getElementById('humoResult').style.display = 'flex';
      document.getElementById('btnAbrirPdfHumo').disabled = false;
    } else {
      setHumoStatus('error', `❌ ${data.error || 'La simulación falló. Intenta nuevamente.'}`);
    }

  } catch (err) {
    if (err.name === 'TimeoutError') {
      setHumoStatus('error', '❌ Tiempo de espera agotado (3 min). El servidor NOAA tardó demasiado.');
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
  const lat          = document.getElementById('humoLat').value;
  const lon          = document.getElementById('humoLon').value;
  const altura       = document.getElementById('humoAltura').value || '500';
  const nombrePunto  = (document.getElementById('pdfNombre').value || '').trim()
                       || `Lat ${lat} · Lon ${lon}`;
  const comentViento = document.getElementById('pdfComentViento').value.trim();
  const comentQuema  = document.getElementById('pdfComentQuema').value.trim();
  const kmzHref      = document.getElementById('humoDownloadLink').href;

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
        humoMap.invalidateSize();
        await new Promise(r => setTimeout(r, 350));
        const mc = await html2canvas(mapEl, {
          scale: 2, useCORS: true, allowTaint: true, logging: false
        });
        mapImgData = mc.toDataURL('image/jpeg', 0.92);
      }
    } catch (_) {}

    // ── 2. Crear rosa de los vientos ──────────────────────────────
    const rosaImg = crearImagenRosa(120);

    // ── 3. jsPDF — Letter Portrait (215.9 × 279.4 mm) ────────────
    const { jsPDF } = window.jspdf;
    const pdf  = new jsPDF({ unit: 'mm', format: 'letter', orientation: 'portrait' });
    const pW   = pdf.internal.pageSize.getWidth();   // 215.9
    const pH   = pdf.internal.pageSize.getHeight();  // 279.4
    const mapH = pH * 0.80;
    const blkY = mapH;
    const blkH = pH - mapH;

    // ── 4. Imagen del mapa (80% superior) ────────────────────────
    if (mapImgData) {
      pdf.addImage(mapImgData, 'JPEG', 0, 0, pW, mapH);
    } else {
      pdf.setFillColor(210, 210, 210);
      pdf.rect(0, 0, pW, mapH, 'F');
      pdf.setTextColor(120, 120, 120);
      pdf.setFontSize(11);
      pdf.text(`${lat}, ${lon}`, pW / 2, mapH / 2, { align: 'center' });
    }

    // ── 5. Title block negro (20% inferior) ──────────────────────
    pdf.setFillColor(0, 0, 0);
    pdf.rect(0, blkY, pW, blkH, 'F');

    // Línea divisoria fina entre mapa y bloque
    pdf.setDrawColor(255, 255, 255);
    pdf.setLineWidth(0.4);
    pdf.line(0, blkY, pW, blkY);

    // ── 6. Texto en el title block ────────────────────────────────
    const fecha    = new Date().toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' });
    const maxTxtW  = pW - 38; // espacio para la rosa

    // Título principal
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.text(`Simulación Ensemble — ${nombrePunto}`, 5, blkY + 8);

    // Subtítulo
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(170, 170, 170);
    pdf.text(`HYSPLIT · Lat ${lat}  Lon ${lon}  ·  Altura ${altura} m  ·  ${fecha}`, 5, blkY + 14);

    // Separador
    pdf.setDrawColor(55, 55, 55);
    pdf.setLineWidth(0.2);
    pdf.line(5, blkY + 17, pW - 5, blkY + 17);

    // Condiciones de viento
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.setTextColor(200, 200, 200);
    pdf.text('CONDICIONES DE VIENTO', 5, blkY + 22);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(255, 255, 255);
    const lineasV = pdf.splitTextToSize(comentViento || '—', maxTxtW);
    pdf.text(lineasV.slice(0, 2), 5, blkY + 27);

    // Condiciones para la quema
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.setTextColor(200, 200, 200);
    pdf.text('CONDICIONES PARA LA QUEMA', 5, blkY + 38);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(255, 255, 255);
    const lineasQ = pdf.splitTextToSize(comentQuema || '—', maxTxtW);
    pdf.text(lineasQ.slice(0, 2), 5, blkY + 43);

    // KMZ link al pie
    if (kmzHref && kmzHref !== '#' && !kmzHref.endsWith(window.location.pathname)) {
      pdf.setFontSize(6);
      pdf.setTextColor(80, 180, 120);
      const kmzLineas = pdf.splitTextToSize('KMZ: ' + kmzHref, maxTxtW);
      pdf.text(kmzLineas[0], 5, blkY + blkH - 4);
    }

    // ── 7. Rosa de los vientos (esquina inferior derecha) ─────────
    const rosaSize = blkH * 0.82;
    pdf.addImage(rosaImg, 'PNG', pW - rosaSize - 3, blkY + (blkH - rosaSize) / 2, rosaSize, rosaSize);

    // ── 8. Guardar ────────────────────────────────────────────────
    const nombreArchivo = `RDCFT_Humo_${lat}_${lon}_${new Date().toISOString().slice(0,10)}.pdf`;
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

function crearImagenRosa(size) {
  const c   = document.createElement('canvas');
  c.width   = c.height = size;
  const ctx = c.getContext('2d');
  const cx  = size / 2, cy = size / 2;
  const r   = size * 0.34;

  // Fondo blanco circular
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.18, 0, Math.PI * 2);
  ctx.fillStyle   = '#ffffff';
  ctx.strokeStyle = '#cccccc';
  ctx.lineWidth   = size * 0.02;
  ctx.fill();
  ctx.stroke();

  // Flecha Norte (negro sólido, apunta arriba)
  ctx.beginPath();
  ctx.moveTo(cx,           cy - r);
  ctx.lineTo(cx - r * 0.3, cy + r * 0.08);
  ctx.lineTo(cx,           cy - r * 0.12);
  ctx.closePath();
  ctx.fillStyle = '#000000';
  ctx.fill();

  // Flecha Sur (blanco con borde, apunta abajo)
  ctx.beginPath();
  ctx.moveTo(cx,           cy + r);
  ctx.lineTo(cx - r * 0.3, cy - r * 0.08);
  ctx.lineTo(cx,           cy + r * 0.12);
  ctx.closePath();
  ctx.fillStyle   = '#ffffff';
  ctx.strokeStyle = '#000000';
  ctx.lineWidth   = size * 0.015;
  ctx.fill();
  ctx.stroke();

  // Flecha Norte lado derecho (espejo)
  ctx.beginPath();
  ctx.moveTo(cx,           cy - r);
  ctx.lineTo(cx + r * 0.3, cy + r * 0.08);
  ctx.lineTo(cx,           cy - r * 0.12);
  ctx.closePath();
  ctx.fillStyle = '#333333';
  ctx.fill();

  // Flecha Sur lado derecho (espejo)
  ctx.beginPath();
  ctx.moveTo(cx,           cy + r);
  ctx.lineTo(cx + r * 0.3, cy - r * 0.08);
  ctx.lineTo(cx,           cy + r * 0.12);
  ctx.closePath();
  ctx.fillStyle   = '#dddddd';
  ctx.strokeStyle = '#000000';
  ctx.lineWidth   = size * 0.015;
  ctx.fill();
  ctx.stroke();

  // Punto central
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.08, 0, Math.PI * 2);
  ctx.fillStyle = '#000000';
  ctx.fill();

  // Letras cardinales
  ctx.fillStyle    = '#000000';
  ctx.font         = `bold ${Math.round(size * 0.17)}px Arial`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('N', cx,           cy - r * 1.52);
  ctx.fillText('S', cx,           cy + r * 1.52);
  ctx.fillText('E', cx + r * 1.52, cy);
  ctx.fillText('O', cx - r * 1.52, cy);

  return c.toDataURL('image/png');
}

// ── Llamado desde ui.js al mostrar la pestaña ────────────────────────
function onHumoTabVisible() {
  if (!humoIniciado) initHumoMap();
  else setTimeout(() => humoMap && humoMap.invalidateSize(), 150);

  // Verificar servidor inmediatamente al abrir la pestaña
  checkServidorHealth();
}
