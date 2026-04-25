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

  mapaInstance.on('click', function(e) {
    const lat = parseFloat(e.latlng.lat.toFixed(6));
    const lon = parseFloat(e.latlng.lng.toFixed(6));
    colocarMarcador(lat, lon);
    rellenarCoordenadas(lat, lon);
  });

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