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

let humoMap        = null;
let humoMarcador   = null;
let humoCapaActual = 'mapa';
let humoCapaMapa   = null;
let humoCapaSat    = null;
let humoCapaEtiq   = null;
let humoIniciado   = false;
let humoServidor   = false;   // true cuando el servidor responde
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
    const resp = await fetch(HUMO_HEALTH, { signal: AbortSignal.timeout(3000) });
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

  humoMap.on('click', function(e) {
    const lat = parseFloat(e.latlng.lat.toFixed(6));
    const lon = parseFloat(e.latlng.lng.toFixed(6));
    humoSetMarcador(lat, lon);
    document.getElementById('humoLat').value = lat;
    document.getElementById('humoLon').value = lon;
    document.getElementById('btnSimular').disabled = false;
    document.getElementById('btnAbrirPdfHumo').disabled = false;
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
      document.getElementById('humoLat').value = lat;
      document.getElementById('humoLon').value = lon;
      document.getElementById('btnSimular').disabled = false;
      document.getElementById('btnAbrirPdfHumo').disabled = false;
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
  const lat    = document.getElementById('humoLat').value;
  const lon    = document.getElementById('humoLon').value;
  const altura = document.getElementById('humoAltura').value || '500';
  const comentViento = document.getElementById('pdfComentViento').value.trim();
  const comentQuema  = document.getElementById('pdfComentQuema').value.trim();
  const kmzHref      = document.getElementById('humoDownloadLink').href;
  const tieneKmz     = kmzHref && kmzHref !== '#' && !kmzHref.endsWith(window.location.pathname);

  const btn = document.getElementById('btnGenerarPdf');
  btn.textContent = '⏳ Generando...';
  btn.disabled    = true;

  const esIOS      = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const ventanaIOS = esIOS ? window.open('', '_blank') : null;

  try {
    // Capturar snapshot del mapa Leaflet
    let mapImgData = null;
    try {
      const mapEl = document.getElementById('humoMapContainer');
      if (mapEl && humoMap) {
        humoMap.invalidateSize();
        await new Promise(r => setTimeout(r, 300));
        const mc = await html2canvas(mapEl, {
          scale: 1.5, useCORS: true, allowTaint: true, logging: false
        });
        mapImgData = mc.toDataURL('image/jpeg', 0.88);
      }
    } catch (_) { /* captura de mapa opcional */ }

    const fecha = new Date().toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' });

    const mapHTML = mapImgData
      ? `<img src="${mapImgData}" style="width:100%;height:200px;object-fit:cover;border-radius:6px;border:0.5px solid #DFD1A7;"/>`
      : `<div style="width:100%;height:60px;background:#EDE8DF;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:11px;color:#696158;">📍 Lat ${lat} · Lon ${lon}</div>`;

    const kmzHTML = tieneKmz
      ? `<div style="font-size:7.5px;font-weight:700;color:#696158;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:7px;">Trayectoria HYSPLIT</div>
         <div style="background:#EAF3DE;border-left:3px solid #1D9E75;padding:8px 12px;border-radius:0 6px 6px 0;font-size:8.5px;color:#444;margin-bottom:12px;">
           Archivo KMZ disponible para visualización en Google Earth:<br/>
           <span style="color:#1D9E75;word-break:break-all;">${kmzHref}</span>
         </div>`
      : '';

    const bloque = (titulo, texto, acento) =>
      `<div style="font-size:7.5px;font-weight:700;color:#696158;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:7px;">${titulo}</div>
       <div style="background:#EDE8DF;border-left:3px solid ${acento};padding:8px 12px;font-size:9px;line-height:1.65;color:#444;margin-bottom:12px;border-radius:0 7px 7px 0;min-height:44px;">
         ${texto || '<span style="color:#bbb;font-style:italic;">Sin comentarios.</span>'}
       </div>`;

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
      <style>* { box-sizing:border-box; } body { margin:0; padding:0; font-family:Arial,sans-serif; background:#fff; }</style>
      </head><body><div style="padding:16px 22px;background:#fff;max-width:860px;">

        <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #696158;padding-bottom:10px;margin-bottom:12px;">
          <img src="data:image/png;base64,${LOGO_ARAUCO_B64}" style="height:34px;object-fit:contain;"/>
          <div style="text-align:right;">
            <div style="font-size:15px;font-weight:800;color:#1a1a1a;">Simulación de Dispersión de Humo</div>
            <div style="font-size:8.5px;color:#696158;margin-top:2px;">HYSPLIT Ensemble · Lat ${lat} · Lon ${lon} · Altura ${altura} m</div>
            <div style="font-size:8.5px;color:#aaa;margin-top:1px;">${fecha}</div>
          </div>
        </div>

        <div style="font-size:7.5px;font-weight:700;color:#696158;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:7px;">Punto de emisión</div>
        ${mapHTML}
        <div style="display:flex;gap:16px;margin:8px 0 14px;font-size:8.5px;color:#696158;">
          <span>📍 Latitud: <strong style="color:#333;">${lat}</strong></span>
          <span>📍 Longitud: <strong style="color:#333;">${lon}</strong></span>
          <span>↑ Altura emisión: <strong style="color:#333;">${altura} m</strong></span>
        </div>

        ${bloque('Condiciones de viento', comentViento.replace(/\n/g,'<br/>'), '#696158')}
        ${bloque('Condiciones para la quema', comentQuema.replace(/\n/g,'<br/>'), '#EA7600')}
        ${kmzHTML}

        <div style="border-top:1px solid #DFD1A7;padding-top:7px;display:flex;justify-content:space-between;font-size:7px;color:#aaa;">
          <span>Modelo: NOAA HYSPLIT Ensemble · Meteorología: GFS Global</span>
          <span>Generado: ${fecha}</span>
        </div>
      </div></body></html>`;

    const bodyHTML = (html.match(/<body>([\s\S]*)<\/body>/) || [,''])[1];
    const tmp = document.createElement('div');
    tmp.style.cssText = 'position:absolute;left:-9999px;top:0;width:900px;background:#fff;';
    tmp.innerHTML = bodyHTML;
    document.body.appendChild(tmp);

    await new Promise(r => setTimeout(r, 600));

    const canvas = await html2canvas(tmp, {
      scale: 2, backgroundColor: '#ffffff',
      useCORS: true, allowTaint: true, logging: false, windowWidth: 900
    });
    document.body.removeChild(tmp);

    const imgData = canvas.toDataURL('image/jpeg', 0.97);
    const { jsPDF } = window.jspdf;
    const pdf  = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const pdfW = pdf.internal.pageSize.getWidth();
    const pdfH = pdf.internal.pageSize.getHeight();
    const imgW = pdfW;
    const imgH = (canvas.height * imgW) / canvas.width;

    if (imgH <= pdfH) {
      pdf.addImage(imgData, 'JPEG', 0, 0, imgW, imgH);
    } else {
      let yOff = 0;
      while (yOff < imgH) {
        if (yOff > 0) pdf.addPage();
        const srcY = (yOff / imgH) * canvas.height;
        const srcH = Math.min((pdfH / imgH) * canvas.height, canvas.height - srcY);
        const pc   = document.createElement('canvas');
        pc.width   = canvas.width; pc.height = srcH;
        pc.getContext('2d').drawImage(canvas, 0, srcY, canvas.width, srcH, 0, 0, canvas.width, srcH);
        pdf.addImage(pc.toDataURL('image/jpeg', 0.97), 'JPEG', 0, 0, imgW, (srcH * imgW) / canvas.width);
        yOff += pdfH;
      }
    }

    const nombre = `RDCFT_Humo_${lat}_${lon}_${new Date().toISOString().slice(0,10)}.pdf`;
    if (esIOS && ventanaIOS) {
      const blobUrl = URL.createObjectURL(pdf.output('blob'));
      ventanaIOS.location.href = blobUrl;
      setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
    } else {
      if (ventanaIOS) ventanaIOS.close();
      pdf.save(nombre);
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

// ── Llamado desde ui.js al mostrar la pestaña ────────────────────────
function onHumoTabVisible() {
  if (!humoIniciado) initHumoMap();
  else setTimeout(() => humoMap && humoMap.invalidateSize(), 150);

  // Verificar servidor inmediatamente al abrir la pestaña
  checkServidorHealth();
}
