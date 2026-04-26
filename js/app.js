// ═══════════════════════════════════════════════════════════════════════
//  app.js
//  Controlador principal — maneja eventos y orquesta los módulos
//
//  Orden de carga de scripts en index.html:
//    1. paisajes.js  → datos de los paisajes
//    2. weather.js   → API + reglas RDCFT
//    3. ui.js        → renderizado
//    4. app.js       → este archivo (controlador)
// ═══════════════════════════════════════════════════════════════════════

let activePaisaje = null;

// ── Selección de paisaje ─────────────────────────────────────────────────
async function onSelectPaisaje(idx) {
  // Toggle: clic en el mismo lo deselecciona
  if (activePaisaje === idx) {
    activePaisaje = null;
    renderSidebar(null);
    renderEmpty();
    return;
  }

  activePaisaje = idx;
  renderSidebar(activePaisaje);

  const p = PAISAJES[idx];
  document.getElementById('mainTitle').textContent = p.n;
  renderLoading(p.n);

  try {
    const apiData = await fetchWeather(p.lat, p.lon);
    const days    = parseHourly(apiData);
    registrarEstadoPaisaje(idx, days);  // ← actualiza el punto del sidebar
    renderDetail(idx, days);
    renderSidebar(activePaisaje);       // ← redibuja sidebar con el nuevo punto
  } catch (err) {
    console.error('[RDCFT] Error cargando clima:', err);
    renderError(idx, err.message);
  }
}

// ── Reintentar tras error ────────────────────────────────────────────────
async function retryLoad(idx) {
  activePaisaje = idx;
  renderSidebar(activePaisaje);

  const p = PAISAJES[idx];
  document.getElementById('mainTitle').textContent = p.n;
  renderLoading(p.n);

  try {
    const apiData = await fetchWeather(p.lat, p.lon);
    const days    = parseHourly(apiData);
    registrarEstadoPaisaje(idx, days);  // ← actualiza el punto del sidebar
    renderDetail(idx, days);
    renderSidebar(activePaisaje);       // ← redibuja sidebar con el nuevo punto
  } catch (err) {
    console.error('[RDCFT] Retry fallido:', err);
    renderError(idx, err.message);
  }
}

// ── Cargar estado de todos los paisajes en paralelo al iniciar ────────────
async function cargarEstadosTodos() {
  // Lanzar todas las peticiones en paralelo con Promise.allSettled
  // (no falla si alguna falla individualmente)
  const promesas = PAISAJES.map((p, i) =>
    fetchWeather(p.lat, p.lon)
      .then(apiData => {
        const days = parseHourly(apiData);
        registrarEstadoPaisaje(i, days);
      })
      .catch(() => {
        // Si falla, dejar sin estado (dot gris)
      })
  );

  // Actualizar el panel resumen a medida que llegan respuestas
  // No tocar el sidebar para no cerrar zonas abiertas por el usuario
  let completados = 0;
  promesas.forEach(p => {
    p.finally(() => {
      completados++;
      if (!activePaisaje) renderEmpty();
      if (completados === PAISAJES.length) {
        console.log('[RDCFT] Estados de todos los paisajes cargados.');
      }
    });
  });
}

// ── Cargar JSON de precipitaciones ──────────────────────────────────────
async function cargarPrecipitaciones() {
  try {
    const resp = await fetch('data/precipitaciones.json');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    window.precipData = await resp.json();
    console.log(`[RDCFT] Precipitaciones cargadas — período: ${window.precipData.periodo.inicio} → ${window.precipData.periodo.fin}`);
  } catch (err) {
    console.warn('[RDCFT] Sin datos de precipitaciones:', err.message);
    window.precipData = null;
  }
}

// ── Inicialización ───────────────────────────────────────────────────────
async function init() {
  await cargarPrecipitaciones();
  renderSidebar(null);
  renderEmpty();
  console.log(`[RDCFT] Dashboard iniciado — ${PAISAJES.length} paisajes cargados.`);
  console.log(`[RDCFT] Límite operacional de viento: ${VIENTO_LIMITE_RDCFT} km/h`);
  cargarEstadosTodos();
}

document.addEventListener('DOMContentLoaded', () => {
  init();
  // Sincronizar ícono del botón con el tema guardado
  const saved = localStorage.getItem('rdcft-theme');
  const btn   = document.getElementById('themeBtn');
  if (btn) btn.textContent = saved === 'light' ? '☀️' : '🌙';
});

// ── Tema claro / oscuro ──────────────────────────────────────────────────
function toggleTheme() {
  const html   = document.documentElement;
  const isLight = html.getAttribute('data-theme') === 'light';
  const next   = isLight ? 'dark' : 'light';
  html.setAttribute('data-theme', next);
  localStorage.setItem('rdcft-theme', next);
  const btn = document.getElementById('themeBtn');
  if (btn) btn.textContent = next === 'light' ? '☀️' : '🌙';
}