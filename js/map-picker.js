/* ═══════════════════════════════════════════════════════════════════════
   map-picker.js
   Selector de coordenadas mediante mapa interactivo (Leaflet)
   Dashboard Meteorológico RDCFT — Arauco
   ═══════════════════════════════════════════════════════════════════════ */

let mapaIniciado   = false;
let mapaInstance   = null;
let marcadorActual = null;
let mapaVisible    = false;

/* ── Abrir / cerrar panel del mapa ─────────────────────────────────── */
function toggleMapa() {
  const panel = document.getElementById('mapPanel');
  mapaVisible = !mapaVisible;
  panel.style.display = mapaVisible ? 'block' : 'none';

  const btn = document.getElementById('btnMapa');
  btn.textContent = mapaVisible ? '✕ Cerrar mapa' : '🗺️ Seleccionar en mapa';

  if (mapaVisible) {
    iniciarMapa();
    // Centrar en coordenadas actuales si ya hay valores
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
    // Solo invalidar tamaño si ya existe (por si el modal cambió de tamaño)
    setTimeout(() => mapaInstance && mapaInstance.invalidateSize(), 100);
    return;
  }

  // Centro inicial: Arauco, Chile
  mapaInstance = L.map('mapContainer', {
    center: [-37.45, -73.35],
    zoom: 9,
    zoomControl: true,
    attributionControl: false
  });

  // Capa de tiles oscura (CartoDB Dark Matter — sin API key)
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    subdomains: 'abcd'
  }).addTo(mapaInstance);

  // Atribución mínima
  L.control.attribution({ prefix: false })
    .addAttribution('© <a href="https://carto.com/">CARTO</a>')
    .addTo(mapaInstance);

  // Clic en el mapa → colocar marcador y rellenar inputs
  mapaInstance.on('click', function(e) {
    const lat = parseFloat(e.latlng.lat.toFixed(6));
    const lon = parseFloat(e.latlng.lng.toFixed(6));
    colocarMarcador(lat, lon);
    rellenarCoordenadas(lat, lon);
  });

  mapaIniciado = true;
  setTimeout(() => mapaInstance.invalidateSize(), 150);
}

/* ── Colocar o mover marcador ──────────────────────────────────────── */
function colocarMarcador(lat, lon) {
  // Ícono personalizado naranja
  const icono = L.divIcon({
    className: '',
    html: `<div style="
      width: 14px; height: 14px;
      background: #E8820A;
      border: 2.5px solid #fff;
      border-radius: 50%;
      box-shadow: 0 0 8px rgba(232,130,10,0.8);
    "></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7]
  });

  if (marcadorActual) {
    marcadorActual.setLatLng([lat, lon]);
  } else {
    marcadorActual = L.marker([lat, lon], { icon: icono }).addTo(mapaInstance);
  }

  // Popup con las coordenadas
  marcadorActual
    .bindPopup(`<b style="color:#E8820A">${lat}, ${lon}</b>`, { closeButton: false })
    .openPopup();
}

/* ── Rellenar inputs del modal ─────────────────────────────────────── */
function rellenarCoordenadas(lat, lon) {
  document.getElementById('inputLat').value = lat;
  document.getElementById('inputLon').value = lon;

  // Feedback visual en los inputs
  ['inputLat', 'inputLon'].forEach(id => {
    const el = document.getElementById(id);
    el.style.borderColor = 'var(--c-orange)';
    setTimeout(() => el.style.borderColor = '', 1500);
  });

  // Mostrar confirmación
  const confirm = document.getElementById('mapConfirm');
  if (confirm) {
    confirm.textContent = `✓ Coordenadas seleccionadas: ${lat}, ${lon}`;
    confirm.style.display = 'block';
    setTimeout(() => confirm.style.display = 'none', 3000);
  }
}

/* ── Limpiar mapa al cerrar el modal ───────────────────────────────── */
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
