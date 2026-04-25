/* ═══════════════════════════════════════════════════════════════════════
   map-picker.js
   Selector de coordenadas mediante mapa interactivo (Leaflet)
   Modos: Mapa oscuro / Satélite
   Dashboard Meteorológico RDCFT — Arauco
   ═══════════════════════════════════════════════════════════════════════ */

let mapaIniciado   = false;
let mapaInstance   = null;
let marcadorActual = null;
let mapaVisible    = false;
let capaActual     = 'mapa';
let capaMapa       = null;
let capaSatelite   = null;
let capaEtiquetas  = null;
let capaPredios    = null;
let prediosVisible = true;

/* ── Abrir / cerrar panel del mapa ─────────────────────────────────── */
function toggleMapa() {
  const panel = document.getElementById('mapPanel');
  mapaVisible = !mapaVisible;
  panel.style.display = mapaVisible ? 'block' : 'none';

  const btn = document.getElementById('btnMapa');
  btn.textContent = mapaVisible ? '✕ Cerrar mapa' : '🗺️ Seleccionar en mapa';

  if (mapaVisible) {
    iniciarMapa();
    const lat = parseFloat(document.getElementById('inputLat').value);
    const lon = parseFloat(document.getElementById('inputLon').value);
    if (!isNaN(lat) && !isNaN(lon) && mapaInstance) {
      mapaInstance.setView([lat, lon], 12);
      colocarMarcador(lat, lon);
    }
  }
}

/* ── Inicializar mapa Leaflet ──────────────────────────────────────── */
function iniciarMapa() {
  if (mapaIniciado) {
    setTimeout(() => mapaInstance && mapaInstance.invalidateSize(), 100);
    return;
  }

  mapaInstance = L.map('mapContainer', {
    center: [-37.45, -73.35],
    zoom: 9,
    zoomControl: true,
    attributionControl: false
  });

  // Capa mapa oscuro
  capaMapa = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    subdomains: 'abcd'
  });

  // Capa satélite (Esri — sin API key)
  capaSatelite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19
  });

  // Capa de etiquetas detallada — pueblos, rutas, calles (OpenStreetMap híbrido)
  capaEtiquetas = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    subdomains: 'abcd',
    opacity: 1.0,
    pane: 'overlayPane'
  });

  capaMapa.addTo(mapaInstance);

  // ── Cargar capa de predios ──────────────────────────────────────
  fetch('/data/predios.geojson')
    .then(r => r.json())
    .then(data => {
      capaPredios = L.geoJSON(data, {
        style: {
          color: '#2DB87A',
          weight: 1.2,
          opacity: 0.9,
          fillColor: '#2DB87A',
          fillOpacity: 0.12
        },
        onEachFeature: function(feature, layer) {
          const nombre = feature.properties.nombre || 'Sin nombre';
          const id = feature.properties.id || '';

          // Popup al hacer click
          layer.bindPopup(
            `<div style="font-family:'Segoe UI',sans-serif;min-width:140px;">
              <div style="font-size:11px;font-weight:700;color:#2DB87A;margin-bottom:4px;">🌲 Predio</div>
              <div style="font-size:13px;font-weight:600;color:#f0ede6;">${nombre}</div>
              ${id ? `<div style="font-size:10px;color:#888;margin-top:3px;">ID: ${id}</div>` : ''}
            </div>`,
            { closeButton: true, maxWidth: 220 }
          );

          // Resaltar al pasar el mouse
          layer.on('mouseover', function() {
            layer.setStyle({ fillOpacity: 0.30, weight: 2, color: '#45d490' });
            layer.openPopup();
          });
          layer.on('mouseout', function() {
            layer.setStyle({ fillOpacity: 0.12, weight: 1.2, color: '#2DB87A' });
          });
          layer.on('mousedown', function(e) {
            L.DomEvent.stopPropagation(e);
          });
          layer.on('touchstart', function(e) {
            L.DomEvent.stopPropagation(e);
          });
        }
      }).addTo(mapaInstance);
    })
    .catch(err => console.warn('[RDCFT] Sin capa de predios:', err));

  // ── Long press para asignar coordenadas (500ms) ──────────────────
  let longPressTimer = null;
  let longPressLat   = null;
  let longPressLon   = null;

  // Capturar coordenadas desde el contenedor del mapa (más confiable)
  const mapContainer = document.getElementById('mapContainer');

  function getPosFromEvent(e) {
    const rect = mapContainer.getBoundingClientRect();
    let clientX, clientY;
    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    return mapaInstance.containerPointToLatLng([x, y]);
  }

  function iniciarLongPress(e) {
    try {
      const latlng = getPosFromEvent(e);
      longPressLat = parseFloat(latlng.lat.toFixed(6));
      longPressLon = parseFloat(latlng.lng.toFixed(6));
    } catch(err) { return; }

    longPressTimer = setTimeout(() => {
      if (longPressLat === null) return;
      colocarMarcador(longPressLat, longPressLon);
      rellenarCoordenadas(longPressLat, longPressLon);
      if (navigator.vibrate) navigator.vibrate(60);
      longPressLat = null;
      longPressLon = null;
    }, 500);
  }

  function cancelarLongPress() {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    longPressLat = null;
    longPressLon = null;
  }

  // Eventos en el contenedor del mapa directamente
  mapContainer.addEventListener('mousedown', iniciarLongPress);
  mapContainer.addEventListener('mouseup', cancelarLongPress);
  mapContainer.addEventListener('mousemove', cancelarLongPress);
  mapContainer.addEventListener('touchstart', iniciarLongPress, { passive: true });
  mapContainer.addEventListener('touchend', cancelarLongPress);
  mapContainer.addEventListener('touchmove', cancelarLongPress, { passive: true });

  mapaIniciado = true;
  setTimeout(() => {
    mapaInstance.invalidateSize();
    actualizarBotonesCapas();
  }, 150);
}

/* ── Cambiar capa ──────────────────────────────────────────────────── */
function cambiarCapa(modo) {
  if (!mapaInstance) return;
  capaActual = modo;
  if (modo === 'satelite') {
    mapaInstance.removeLayer(capaMapa);
    capaSatelite.addTo(mapaInstance);
    capaEtiquetas.addTo(mapaInstance); // etiquetas sobre satélite
  } else {
    mapaInstance.removeLayer(capaSatelite);
    mapaInstance.removeLayer(capaEtiquetas);
    capaMapa.addTo(mapaInstance);
  }
  actualizarBotonesCapas();
}

function actualizarBotonesCapas() {
  const btnM = document.getElementById('btnCapaMapa');
  const btnS = document.getElementById('btnCapaSatelite');
  if (!btnM || !btnS) return;
  btnM.classList.toggle('active', capaActual === 'mapa');
  btnS.classList.toggle('active', capaActual === 'satelite');
}

/* ── Toggle capa de predios ────────────────────────────────────────── */
function togglePredios() {
  if (!capaPredios || !mapaInstance) return;
  prediosVisible = !prediosVisible;
  if (prediosVisible) {
    capaPredios.addTo(mapaInstance);
  } else {
    mapaInstance.removeLayer(capaPredios);
  }
  const btn = document.getElementById('btnPredios');
  if (btn) btn.classList.toggle('active', prediosVisible);
}

/* ── Colocar marcador ──────────────────────────────────────────────── */
function colocarMarcador(lat, lon) {
  const icono = L.divIcon({
    className: '',
    html: `<div style="width:14px;height:14px;background:#E8820A;border:2.5px solid #fff;border-radius:50%;box-shadow:0 0 8px rgba(232,130,10,0.8);"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7]
  });
  if (marcadorActual) {
    marcadorActual.setLatLng([lat, lon]);
  } else {
    marcadorActual = L.marker([lat, lon], { icon: icono }).addTo(mapaInstance);
  }
  marcadorActual.bindPopup(`<b style="color:#E8820A">${lat}, ${lon}</b>`, { closeButton: false }).openPopup();
}

/* ── Rellenar inputs ───────────────────────────────────────────────── */
function rellenarCoordenadas(lat, lon) {
  document.getElementById('inputLat').value = lat;
  document.getElementById('inputLon').value = lon;
  ['inputLat', 'inputLon'].forEach(id => {
    const el = document.getElementById(id);
    el.style.borderColor = 'var(--c-orange)';
    setTimeout(() => el.style.borderColor = '', 1500);
  });
  const confirm = document.getElementById('mapConfirm');
  if (confirm) {
    confirm.textContent = `✓ Coordenadas seleccionadas: ${lat}, ${lon}`;
    confirm.style.display = 'block';
    setTimeout(() => confirm.style.display = 'none', 3000);
  }
}


/* ── Geolocalización ───────────────────────────────────────────────── */
function miUbicacion() {
  const btn = document.getElementById('btnGeo');
  if (!navigator.geolocation) {
    alert('Tu navegador no soporta geolocalización.');
    return;
  }

  btn.textContent = '⏳';
  btn.disabled = true;

  navigator.geolocation.getCurrentPosition(
    function(pos) {
      const lat = parseFloat(pos.coords.latitude.toFixed(6));
      const lon = parseFloat(pos.coords.longitude.toFixed(6));

      // Iniciar mapa si no está listo
      if (!mapaIniciado) iniciarMapa();

      // Centrar y zoom
      mapaInstance.setView([lat, lon], 14);
      colocarMarcador(lat, lon);
      rellenarCoordenadas(lat, lon);

      btn.textContent = '📍';
      btn.disabled = false;
    },
    function(err) {
      btn.textContent = '📍';
      btn.disabled = false;
      const mensajes = {
        1: 'Permiso de ubicación denegado. Actívalo en tu navegador.',
        2: 'No se pudo obtener tu ubicación.',
        3: 'Tiempo de espera agotado.'
      };
      alert(mensajes[err.code] || 'Error de geolocalización.');
    },
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
  );
}

/* ── Reset al cerrar ───────────────────────────────────────────────── */
function resetMapa() {
  mapaVisible = false;
  const panel = document.getElementById('mapPanel');
  if (panel) panel.style.display = 'none';
  const btn = document.getElementById('btnMapa');
  if (btn) btn.textContent = '🗺️ Seleccionar en mapa';
  if (marcadorActual && mapaInstance) {
    mapaInstance.removeLayer(marcadorActual);
    marcadorActual = null;
  }
}