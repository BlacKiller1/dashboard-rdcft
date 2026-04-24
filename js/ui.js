// ═══════════════════════════════════════════════════════════════════════
//  ui.js
//  Funciones de renderizado e interacción con el DOM
//
//  Depende de: paisajes.js, weather.js
// ═══════════════════════════════════════════════════════════════════════

const DIAS_NAMES = ['LUN','MAR','MIÉ','JUE','VIE','SÁB','DOM'];
const MESES      = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const DAY_NAMES  = ['DOM','LUN','MAR','MIÉ','JUE','VIE','SÁB'];

const LABELS = {
  favorable:      'Favorable',
  restriccion:    'Con restricciones',
  'no-favorable': 'No favorable',
  'sin-rdcft':    'Sin RDCFT programado'
};

const SEM_COLORS = {
  ok:      'var(--c-green)',
  warn:    'var(--c-yellow)',
  bad:     'var(--c-red)',
  neutral: 'var(--c-text-dim)'
};

const SEM_LABELS = {
  ok:      'Favorable',
  warn:    'Restricción',
  bad:     'No favorable',
  neutral: '—'
};

// ── Calcular estado real de un día desde datos de la API ─────────────────
//    Debe definirse ANTES de cualquier función que la use
function estadoDia(day) {
  if (!day || !day.slots.length) return 'neutral';
  const todosOperables = day.slots.every(s => s.rdcft.operable);
  const algunOperable  = day.slots.some(s => s.rdcft.operable);
  if (todosOperables) return 'ok';
  if (algunOperable)  return 'warn';
  return 'bad';
}

// Estado activo
let currentHour       = '10:00';
let activeWeatherDays = null;
let activePaisajeIdx  = null;



// ── Sidebar ──────────────────────────────────────────────────────────────
// Mapa de estado calculado por la API para cada paisaje (se llena al seleccionar)
const PAISAJE_ESTADO = {};

function renderSidebar(activeIdx) {
  // Construir sidebar agrupado por zonas
  const html = ZONAS.map(zona => {
    // Encontrar los paisajes de esta zona con su índice global
    const itemsZona = zona.paisajes.map(nombre => {
      const idx = PAISAJES.findIndex(p => p.n === nombre);
      if (idx === -1) return '';
      const p      = PAISAJES[idx];
      const estado = PAISAJE_ESTADO[idx];
      const dotHTML = estado
        ? `<span class="dot ${estado}"></span>`
        : `<span class="dot-empty"></span>`;
      return `
        <div class="p-item${activeIdx === idx ? ' active' : ''}" onclick="onSelectPaisaje(${idx})">
          ${dotHTML}
          <span class="pname">${p.n}</span>
        </div>`;
    }).join('');

    // Verificar si algún paisaje de la zona está activo para mantenerla abierta
    const zonaActiva = zona.paisajes.some(nombre => {
      const idx = PAISAJES.findIndex(p => p.n === nombre);
      return idx === activeIdx;
    });

    return `
      <div class="zona-group">
        <div class="zona-header" onclick="toggleZona(this)">
          <span class="zona-name">${zona.nombre}</span>
          <span class="zona-arrow${zonaActiva ? ' open' : ''}">▾</span>
        </div>
        <div class="zona-items${zonaActiva ? ' open' : ''}">
          ${itemsZona}
        </div>
      </div>`;
  }).join('');

  document.getElementById('sidebarList').innerHTML = html;
}

function toggleZona(header) {
  const arrow = header.querySelector('.zona-arrow');
  const items = header.nextElementSibling;
  const isOpen = items.classList.contains('open');
  // Cerrar todos
  document.querySelectorAll('.zona-items').forEach(el => el.classList.remove('open'));
  document.querySelectorAll('.zona-arrow').forEach(el => el.classList.remove('open'));
  // Abrir el clickeado si estaba cerrado
  if (!isOpen) {
    items.classList.add('open');
    arrow.classList.add('open');
  }
}

// Llamada desde app.js después de cargar datos: registra el estado real del paisaje
function registrarEstadoPaisaje(idx, days) {
  // Estado general: si TODOS los días son operables → ok, si NINGUNO → bad, si mixto → warn
  const totales = days.length;
  const operables = days.filter(d => estadoDia(d) === 'ok').length;
  const parciales = days.filter(d => estadoDia(d) === 'warn').length;
  if (operables === totales)        PAISAJE_ESTADO[idx] = 'favorable';
  else if (operables + parciales === 0) PAISAJE_ESTADO[idx] = 'no-favorable';
  else                              PAISAJE_ESTADO[idx] = 'restriccion';
}

// ── Estados vacío / loading / error ─────────────────────────────────────
function renderEmpty() {
  document.getElementById('mainTitle').textContent = 'Selecciona un paisaje';
  document.getElementById('detailPanel').innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">🌲</div>
      <div class="empty-text">Selecciona un paisaje para ver el pronóstico</div>
    </div>`;
}

function renderLoading(nombre) {
  document.getElementById('detailPanel').innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <div class="loading-text">Cargando datos de Open-Meteo para <strong>${nombre}</strong>…</div>
    </div>`;
}

function renderError(idx, mensaje) {
  document.getElementById('detailPanel').innerHTML = `
    <div class="error-state">
      <div class="error-icon">⚠️</div>
      <div class="error-text">
        No se pudo cargar el pronóstico.<br>${mensaje}<br><br>
        Verifica tu conexión a internet.
      </div>
      <button class="retry-btn" onclick="retryLoad(${idx})">Reintentar</button>
    </div>`;
}

// ── Semáforo semanal ──────────────────────────────────────────────────────
function renderSemaforo(paisaje, days) {
  const DAY_ABBR = ['DOM','LUN','MAR','MIÉ','JUE','VIE','SÁB'];
  return days.map((day, idx) => {
    const estado   = estadoDia(day);
    const dateObj  = new Date(day.date + 'T12:00:00');
    const dayAbbr  = DAY_ABBR[dateObj.getDay()];
    const fechaStr = day.date.slice(5).replace('-', '/');
    return `
      <div class="dc ${estado}" onclick="mostrarDetalleDia(${idx})" style="cursor:pointer;" title="Ver detalle del día">
        <span class="dn">${dayAbbr}</span>
        <span class="df">${fechaStr}</span>
      </div>`;
  }).join('');
}

// ── Detalle por día al hacer clic en semáforo ─────────────────────────────
function mostrarDetalleDia(idx) {
  if (!activeWeatherDays) return;
  const day     = activeWeatherDays[idx];
  if (!day) return;

  const DAY_FULL  = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  const MESES_F   = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const dateObj   = new Date(day.date + 'T12:00:00');
  const dayFull   = DAY_FULL[dateObj.getDay()];
  const dayNum    = dateObj.getDate();
  const mes       = MESES_F[dateObj.getMonth()];
  const estado    = estadoDia(day);
  const estColor  = { ok:'var(--c-green)', warn:'var(--c-yellow)', bad:'var(--c-red)', neutral:'var(--c-text-dim)' };
  const estLabel  = { ok:'Operable', warn:'Restricción parcial', bad:'No operable', neutral:'Sin operación' };

  // Generar comentario por slot horario
  const comentarioSlots = day.slots.map(s => {
    const rdcftColor = s.rdcft.operable ? 'var(--c-green)' : 'var(--c-red)';
    const rdcftIcon  = s.rdcft.operable ? '✅' : '🚫';

    // Comentario automático por hora
    let comentario = '';
    if (!s.rdcft.operable) {
      comentario = `Viento de ${s.viento} km/h supera el límite operacional de ${VIENTO_LIMITE_RDCFT} km/h. <strong>No es posible realizar RDCFT.</strong>`;
    } else {
      const nivelViento = s.viento <= 5 ? 'muy bajo' : s.viento <= 8 ? 'bajo' : 'dentro del límite';
      const nivelTemp   = s.temp >= 25 ? 'alta' : s.temp >= 18 ? 'moderada' : 'baja';
      const nivelHum    = s.hum >= 70 ? 'alta' : s.hum >= 50 ? 'moderada' : 'baja';
      comentario = `Viento ${nivelViento} (${s.viento} km/h), temperatura ${nivelTemp} (${s.temp}°C) y humedad ${nivelHum} (${s.hum}%). ` +
        `${s.precip > 0 ? `Precipitación de ${s.precip} mm. ` : 'Sin precipitaciones. '}` +
        `<strong>Condiciones favorables para RDCFT.</strong>`;
    }

    return `
      <div class="slot-card">
        <div class="slot-header">
          <div class="slot-hora">${s.hora}</div>
          <div class="slot-icon">${codigoIcono(s.codigo)}</div>
          <div class="slot-rdcft" style="color:${rdcftColor}">${rdcftIcon} ${s.rdcft.operable ? 'Posible' : 'No posible'}</div>
        </div>
        <div class="slot-datos">
          <div class="slot-dato"><span class="sd-l">🌡 Temp.</span><span class="sd-v" style="color:${tempColor(s.temp)}">${s.temp}°C</span></div>
          <div class="slot-dato"><span class="sd-l">💧 Humedad</span><span class="sd-v" style="color:var(--c-blue)">${s.hum}%</span></div>
          <div class="slot-dato"><span class="sd-l">🌧 Lluvia</span><span class="sd-v" style="color:${precipColor(s.precip)}">${s.precip} mm</span></div>
          <div class="slot-dato"><span class="sd-l">💨 Viento</span><span class="sd-v" style="color:${vientoColor(s.viento)}">${dirArrow(s.direccion)} ${s.viento} km/h</span></div>
          <div class="slot-dato"><span class="sd-l">⚡ Racha</span><span class="sd-v" style="color:var(--c-yellow)">${s.racha} km/h</span></div>
          <div class="slot-dato"><span class="sd-l">🧭 Direc.</span><span class="sd-v">${s.direccion}° ${compassLabel(s.direccion)}</span></div>
        </div>
        <div class="slot-comentario">${comentario}</div>
      </div>`;
  }).join('');

  // Insertar panel debajo del semáforo
  const existing = document.getElementById('detalleDiaPanel');
  if (existing) existing.remove();

  const panel = document.createElement('div');
  panel.id    = 'detalleDiaPanel';
  panel.className = 'detalle-dia-panel';
  panel.innerHTML = `
    <div class="detalle-dia-header">
      <div>
        <div class="detalle-dia-titulo">${dayFull} ${dayNum} de ${mes}</div>
        <div class="detalle-dia-estado" style="color:${estColor[estado]}">${estLabel[estado]}</div>
      </div>
      <button class="detalle-dia-close" onclick="document.getElementById('detalleDiaPanel').remove()">✕ Cerrar</button>
    </div>
    <div class="slots-row">${comentarioSlots}</div>
  `;

  // Insertarlo después del comment-box (dentro de la primera dcard)
  const commentBox = document.querySelector('.comment-box');
  if (commentBox) {
    commentBox.parentNode.insertBefore(panel, commentBox.nextSibling);
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

// ── Tabla meteorológica ───────────────────────────────────────────────────
function buildWeatherTable(days, paisaje) {
  const thead = `
    <tr>
      <th class="col-day">Día</th>
      <th>Condición</th>
      <th>🌡 Temp.</th>
      <th>💧 Humedad</th>
      <th>🌧 Lluvia</th>
      <th>💨 Viento</th>
      <th>⚡ Racha</th>
      <th>🧭 Dirección</th>
      <th>🔥 RDCFT</th>
    </tr>`;

  const tbody = days.map((day, di) => {
    const slot    = day.slots.find(s => s.hora === currentHour) || day.slots[0];
    const sem     = estadoDia(day);  // ← estado real desde API, no manual
    const dateObj = new Date(day.date + 'T12:00:00');
    const dayName = DAY_NAMES[dateObj.getDay()];
    const dayNum  = dateObj.getDate();
    const month   = MESES[dateObj.getMonth()];

    if (!slot) return `
      <tr>
        <td class="col-day"><div class="day-cell-name">${dayName}</div></td>
        <td colspan="8" style="color:var(--c-text-dim);font-size:11px;text-align:center;">Sin datos</td>
      </tr>`;

    // ── Estado RDCFT basado en TODOS los slots del día (coherente con semáforo) ──
    const estadoDelDia  = estadoDia(day);
    const todosOp       = day.slots.every(s => s.rdcft.operable);
    const ninguno       = day.slots.every(s => !s.rdcft.operable);
    const rdcftColor    = todosOp  ? 'var(--c-green)'  : ninguno ? 'var(--c-red)' : 'var(--c-yellow)';
    const rdcftIcon     = todosOp  ? '✅' : ninguno ? '🚫' : '⚠️';
    const rdcftLabel    = todosOp  ? 'Posible' : ninguno ? 'No posible' : 'Parcial';
    // Resumen de qué horas son operables
    const horasOp       = day.slots.filter(s => s.rdcft.operable).map(s => s.hora).join(', ');
    const horasNO       = day.slots.filter(s => !s.rdcft.operable).map(s => s.hora).join(', ');
    const rdcftDetalle  = todosOp
      ? `Todas las horas dentro del límite`
      : ninguno
        ? `Viento supera ${VIENTO_LIMITE_RDCFT} km/h en todas las horas`
        : `Operable: ${horasOp} · No operable: ${horasNO}`;

    return `
      <tr>
        <td class="col-day">
          <div class="day-cell-name">${dayName}</div>
          <div class="day-cell-date">${dayNum} ${month}</div>
          <div class="day-cell-status" style="color:${SEM_COLORS[sem]}">${SEM_LABELS[sem]}</div>
        </td>
        <td>
          <div class="w-icon">${codigoIcono(slot.codigo)}</div>
        </td>
        <td>
          <div class="w-temp" style="color:${tempColor(slot.temp)}">${slot.temp}°C</div>
        </td>
        <td>
          <div class="w-humidity">${slot.hum}%</div>
        </td>
        <td>
          <div class="w-precip" style="color:${precipColor(slot.precip)}">${slot.precip} mm</div>
        </td>
        <td>
          <div class="w-wind-row" style="color:${vientoColor(slot.viento)}">
            <span class="w-arrow">${dirArrow(slot.direccion)}</span>
            <strong>${slot.viento} km/h</strong>
          </div>
          ${slot.viento > VIENTO_LIMITE_RDCFT
            ? `<div class="wind-alert">>${VIENTO_LIMITE_RDCFT} km/h</div>`
            : ''}
        </td>
        <td>
          <div class="w-gust">${slot.racha} km/h</div>
        </td>
        <td>
          <div style="font-size:11px;color:var(--c-text-muted)">
            ${slot.direccion}° ${compassLabel(slot.direccion)}
          </div>
        </td>
        <td>
          <div class="rdcft-cell" style="color:${rdcftColor}">
            <span class="rdcft-icon">${rdcftIcon}</span>
            <span class="rdcft-label">${rdcftLabel}</span>
          </div>
          <div class="rdcft-reason">${rdcftDetalle}</div>
        </td>
      </tr>`;
  }).join('');

  return `
    <div class="wtable-scroll">
      <table class="wtable">
        <thead>${thead}</thead>
        <tbody>${tbody}</tbody>
      </table>
    </div>`;
}

// ── Card meteorológica completa ───────────────────────────────────────────
function renderWeatherCard(days, paisaje) {
  const avg    = calcAvgTemp(days);
  const precip = calcTotalPrecip(days);

  // Contar días operables según viento real
  const diasOperables = days.filter(day => {
    const slot = day.slots.find(s => s.hora === currentHour) || day.slots[0];
    return slot && slot.rdcft.operable;
  }).length;

  const hourTabs = TARGET_HOURS.map(h => `
    <button class="htab${currentHour === h ? ' active' : ''}" onclick="switchHour('${h}')">
      ${h}
    </button>`).join('');

  return `
    <div class="dcard" id="weatherCard">
      <div class="wtable-header">
        <div>
          <div class="sec-label" style="margin-bottom:6px;">Pronóstico meteorológico — Open-Meteo</div>
          <div class="hour-tabs">${hourTabs}</div>
        </div>
        <div class="wmeta">
          <div class="wmeta-item">
            <div class="wml">Temp. media</div>
            <div class="wmv">${avg}°C</div>
          </div>
          <div class="wmeta-item">
            <div class="wml">Precip. total</div>
            <div class="wmv">${precip} mm</div>
          </div>
          <div class="wmeta-item">
            <div class="wml">Días operables (${currentHour})</div>
            <div class="wmv" style="color:${diasOperables > 0 ? 'var(--c-green)' : 'var(--c-red)'}">
              ${diasOperables} / 7
            </div>
          </div>
          <div class="wmeta-item">
            <div class="wml">Coordenadas</div>
            <div class="wmv coords-badge">${paisaje.lat.toFixed(4)}, ${paisaje.lon.toFixed(4)}</div>
          </div>
        </div>
      </div>

      <!-- Regla operacional visible -->
      <div class="rdcft-rule-banner">
        <span class="rdcft-rule-icon">⚠️</span>
        <span>
          <strong>Regla operacional RDCFT:</strong>
          Viento &gt; ${VIENTO_LIMITE_RDCFT} km/h → No es posible realizar fuego técnico.
          Las celdas en rojo indican horarios fuera del límite operacional.
        </span>
      </div>

      ${buildWeatherTable(days, paisaje)}
    </div>`;
}

// ── Generar resumen operacional automático desde datos reales ─────────────
function generarResumenOperacional(days) {
  const DAY_FULL   = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  const MESES_FULL = ['enero','febrero','marzo','abril','mayo','junio','julio',
                      'agosto','septiembre','octubre','noviembre','diciembre'];

  // Analizar cada día promediando los 3 slots horarios
  const analisis = days.map(day => {
    const slots = day.slots;
    if (!slots.length) return null;
    const avgViento = slots.reduce((s, x) => s + x.viento, 0) / slots.length;
    const avgTemp   = slots.reduce((s, x) => s + x.temp,   0) / slots.length;
    const avgHum    = slots.reduce((s, x) => s + x.hum,    0) / slots.length;
    const sumPrecip = slots.reduce((s, x) => s + x.precip, 0);
    const operable  = slots.every(s => s.rdcft.operable);
    const dateObj   = new Date(day.date + 'T12:00:00');
    return {
      dayName: DAY_FULL[dateObj.getDay()],
      dayNum:  dateObj.getDate(),
      month:   MESES_FULL[dateObj.getMonth()],
      avgViento, avgTemp, avgHum, sumPrecip, operable
    };
  }).filter(Boolean);

  if (!analisis.length) return 'Sin datos meteorológicos disponibles para esta semana.';

  const diasOperables   = analisis.filter(d => d.operable);
  const diasNoOperables = analisis.filter(d => !d.operable);
  const totalPrecip     = analisis.reduce((s, d) => s + d.sumPrecip, 0);
  const avgTempSemana   = analisis.reduce((s, d) => s + d.avgTemp,   0) / analisis.length;
  const avgVientoSemana = analisis.reduce((s, d) => s + d.avgViento, 0) / analisis.length;
  const avgHumSemana    = analisis.reduce((s, d) => s + d.avgHum,    0) / analisis.length;

  const parrafos = [];

  // Párrafo 1 — Condición general y ventana operacional
  if (diasOperables.length === 0) {
    parrafos.push(
      `La semana presenta condiciones <strong>no favorables</strong> para la ejecución de RDCFT en todos los días pronosticados, ` +
      `con vientos promedio de ${avgVientoSemana.toFixed(1)} km/h que superan el límite operacional de ${VIENTO_LIMITE_RDCFT} km/h.`
    );
  } else if (diasOperables.length === analisis.length) {
    parrafos.push(
      `La semana presenta condiciones <strong>favorables</strong> para la ejecución de RDCFT durante todos los días pronosticados, ` +
      `con vientos promedio de ${avgVientoSemana.toFixed(1)} km/h y temperaturas en torno a los ${avgTempSemana.toFixed(1)}°C.`
    );
  } else {
    const p = diasOperables[0];
    const u = diasOperables[diasOperables.length - 1];
    const ventana = diasOperables.length === 1
      ? `el ${p.dayName} ${p.dayNum} de ${p.month}`
      : `desde el ${p.dayName} ${p.dayNum} hasta el ${u.dayName} ${u.dayNum} de ${u.month}`;
    parrafos.push(
      `Se proyecta una ventana operacional para RDCFT ${ventana}, ` +
      `con vientos dentro del límite de ${VIENTO_LIMITE_RDCFT} km/h y temperaturas moderadas en torno a los ${avgTempSemana.toFixed(1)}°C.`
    );
  }

  // Párrafo 2 — Días no operables y causa
  if (diasNoOperables.length > 0 && diasOperables.length > 0) {
    const nombresNO = diasNoOperables.map(d => `${d.dayName} ${d.dayNum}`).join(', ');
    const maxViento = Math.max(...diasNoOperables.map(d => d.avgViento));
    parrafos.push(
      `Los días ${nombresNO} presentan vientos de intensidad ${maxViento > 20 ? 'alta' : 'moderada a alta'} ` +
      `(promedio ${maxViento.toFixed(1)} km/h), superando el umbral operacional y ` +
      `<strong>restringiendo la ejecución de fuego técnico</strong>.`
    );
  }

  // Párrafo 3 — Precipitaciones y humedad
  if (totalPrecip > 20) {
    parrafos.push(
      `Se registran precipitaciones significativas acumuladas de ${totalPrecip.toFixed(1)} mm durante la semana, ` +
      `con humedad relativa promedio de ${avgHumSemana.toFixed(0)}%, lo que puede afectar la receptividad del combustible.`
    );
  } else if (totalPrecip > 5) {
    parrafos.push(
      `Se proyectan precipitaciones leves con acumulado de ${totalPrecip.toFixed(1)} mm durante la semana, ` +
      `con humedad relativa promedio de ${avgHumSemana.toFixed(0)}%.`
    );
  } else {
    parrafos.push(
      `Muy baja cantidad de precipitaciones acumuladas durante la semana (${totalPrecip.toFixed(1)} mm), ` +
      `con humedad relativa promedio de ${avgHumSemana.toFixed(0)}%.`
    );
  }

  return parrafos.join('<br><br>');
}

// ── Card operacional (semáforo + comentario auto) ─────────────────────────
function renderOperationalCard(paisaje, days) {
  const resumenAuto = generarResumenOperacional(days);
  const diasOk      = days.filter(d => estadoDia(d) === 'ok').length;
  const diasWarn    = days.filter(d => estadoDia(d) === 'warn').length;
  const diasBad     = days.filter(d => estadoDia(d) === 'bad').length;
  const totalPrecip = days.reduce((s, d) => s + d.slots.reduce((a, x) => a + x.precip, 0), 0);

  return `
    <div class="dcard">
      <div class="detail-top">
        <span class="detail-title">${paisaje.n}</span>
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="ebadge ${paisaje.e}">${LABELS[paisaje.e]}</span>
          <button class="pdf-btn" onclick="descargarPDF('${paisaje.n}')">
            ⬇ Descargar PDF
          </button>
        </div>
      </div>

      <div class="sec-label">Ventana operacional semanal</div>
      <div class="dias-row">${renderSemaforo(paisaje, days)}</div>



      <div class="mini-stats">
        <div class="ms">
          <div class="ml">Operables</div>
          <div class="mv" style="color:var(--c-green)">${diasOk}</div>
        </div>
        <div class="ms">
          <div class="ml">Restricción</div>
          <div class="mv" style="color:var(--c-yellow)">${diasWarn}</div>
        </div>
        <div class="ms">
          <div class="ml">No operables</div>
          <div class="mv" style="color:var(--c-red)">${diasBad}</div>
        </div>
        <div class="ms">
          <div class="ml">Precip. total</div>
          <div class="mv" style="color:var(--c-blue)">${totalPrecip.toFixed(1)} mm</div>
        </div>
        <div class="ms">
          <div class="ml">Límite viento</div>
          <div class="mv" style="color:var(--c-orange)">${VIENTO_LIMITE_RDCFT} km/h</div>
        </div>
      </div>
    </div>`;
}

// ── Generar y descargar PDF de la lámina ─────────────────────────────────
function descargarPDF(nombrePaisaje) {
  const panel = document.getElementById('detailPanel');
  if (!panel) return;

  const opt = {
    margin:      [10, 10, 10, 10],
    filename:    `RDCFT_${nombrePaisaje.replace(/ /g,'_')}.pdf`,
    image:       { type: 'jpeg', quality: 0.95 },
    html2canvas: {
      scale: 2,
      backgroundColor: '#181714',
      useCORS: true,
      logging: false
    },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
  };

  // Mostrar feedback visual en el botón
  const btn = document.querySelector('.pdf-btn');
  if (btn) { btn.textContent = '⏳ Generando...'; btn.disabled = true; }

  html2pdf().set(opt).from(panel).save().then(() => {
    if (btn) { btn.textContent = '⬇ Descargar PDF'; btn.disabled = false; }
  });
}

// ── Render completo del detalle ───────────────────────────────────────────
function renderDetail(idx, days) {
  const p           = PAISAJES[idx];
  activeWeatherDays = days;
  activePaisajeIdx  = idx;

  document.getElementById('detailPanel').innerHTML =
    renderOperationalCard(p, days) +
    renderWeatherCard(days, p);
}

// ── Cambiar hora (sin recargar la API) ────────────────────────────────────
function switchHour(h) {
  currentHour = h;
  if (activeWeatherDays !== null && activePaisajeIdx !== null) {
    const p   = PAISAJES[activePaisajeIdx];
    const old = document.getElementById('weatherCard');
    if (old) old.outerHTML = renderWeatherCard(activeWeatherDays, p);
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  CONSULTA POR COORDENADAS — pronóstico de 24 horas para punto libre
// ═══════════════════════════════════════════════════════════════════════

function abrirConsulta() {
  // Calcular hoy y máximo (16 días, límite de Open-Meteo)
  const hoy    = new Date();
  const maxDia = new Date();
  maxDia.setDate(hoy.getDate() + 15);

  const fmt = d => d.toISOString().split('T')[0];

  const inputFecha = document.getElementById('inputFecha');
  inputFecha.min   = fmt(hoy);
  inputFecha.max   = fmt(maxDia);
  inputFecha.value = fmt(hoy);  // por defecto: hoy

  document.getElementById('modalOverlay').style.display  = 'block';
  document.getElementById('modalConsulta').style.display = 'flex';
  document.getElementById('modalResult').innerHTML       = '';
  document.getElementById('modalError').style.display   = 'none';
  document.getElementById('inputLat').value             = '';
  document.getElementById('inputLon').value             = '';
  document.getElementById('inputNombre').value          = '';
}

function cerrarConsulta() {
  document.getElementById('modalOverlay').style.display  = 'none';
  document.getElementById('modalConsulta').style.display = 'none';
}

async function ejecutarConsulta() {
  const lat        = parseFloat(document.getElementById('inputLat').value);
  const lon        = parseFloat(document.getElementById('inputLon').value);
  const fechaSel   = document.getElementById('inputFecha').value;
  const nombre     = document.getElementById('inputNombre').value.trim() || `${lat}, ${lon}`;
  const errDiv     = document.getElementById('modalError');
  const result     = document.getElementById('modalResult');
  const btn        = document.getElementById('btnConsultar');

  // Validar coordenadas
  errDiv.style.display = 'none';
  if (isNaN(lat) || isNaN(lon)) {
    errDiv.textContent   = 'Por favor ingresa coordenadas válidas.';
    errDiv.style.display = 'block';
    return;
  }
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    errDiv.textContent   = 'Coordenadas fuera de rango. Lat: -90 a 90, Lon: -180 a 180.';
    errDiv.style.display = 'block';
    return;
  }
  if (!fechaSel) {
    errDiv.textContent   = 'Por favor selecciona una fecha.';
    errDiv.style.display = 'block';
    return;
  }

  // Loading
  btn.textContent  = '⏳ Consultando...';
  btn.disabled     = true;
  result.innerHTML = `<div class="modal-loading"><div class="spinner"></div><div class="loading-text">Consultando Open-Meteo para el ${fechaSel}…</div></div>`;

  try {
    // Calcular cuántos días de forecast necesitamos para llegar a la fecha seleccionada
    const hoy       = new Date();
    hoy.setHours(0,0,0,0);
    const fechaObj  = new Date(fechaSel + 'T00:00:00');
    const diasDiff  = Math.round((fechaObj - hoy) / 86400000);
    const forecastDays = Math.max(diasDiff + 1, 1);

    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${lat}&longitude=${lon}` +
      `&hourly=temperature_2m,relativehumidity_2m,precipitation,windspeed_10m,windgusts_10m,winddirection_10m,weathercode` +
      `&timezone=America%2FSantiago&forecast_days=${forecastDays}&wind_speed_unit=kmh`;

    const res  = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // Filtrar solo las horas del día seleccionado
    const slots24 = [];
    data.hourly.time.forEach((t, i) => {
      if (t.startsWith(fechaSel)) {
        const viento = Math.round(data.hourly.windspeed_10m[i]);
        slots24.push({
          hora:      t.split('T')[1],
          fecha:     t.split('T')[0],
          temp:      Math.round(data.hourly.temperature_2m[i]),
          hum:       Math.round(data.hourly.relativehumidity_2m[i]),
          precip:    +(data.hourly.precipitation[i]).toFixed(1),
          viento:    viento,
          racha:     Math.round(data.hourly.windgusts_10m[i]),
          direccion: Math.round(data.hourly.winddirection_10m[i]),
          codigo:    data.hourly.weathercode[i],
          operable:  viento <= VIENTO_LIMITE_RDCFT
        });
      }
    });

    if (!slots24.length) throw new Error(`Sin datos disponibles para el ${fechaSel}.`);

    // Calcular resumen
    const operables   = slots24.filter(s => s.operable).length;
    const avgTemp     = (slots24.reduce((s, x) => s + x.temp, 0) / slots24.length).toFixed(1);
    const totalPrecip = slots24.reduce((s, x) => s + x.precip, 0).toFixed(1);
    const maxViento   = Math.max(...slots24.map(s => s.viento));

    // Construir tabla
    const filas = slots24.map(s => {
      const rdcftColor = s.operable ? 'var(--c-green)' : 'var(--c-red)';
      const rdcftIcon  = s.operable ? '✅' : '🚫';
      return `
        <tr>
          <td style="text-align:left;padding-left:0;">
            <div style="font-size:11px;font-weight:600;color:var(--c-text)">${s.hora}</div>
            <div style="font-size:9px;color:var(--c-text-dim)">${s.fecha.slice(5).replace('-','/')}</div>
          </td>
          <td>${codigoIcono(s.codigo)}</td>
          <td style="color:${tempColor(s.temp)};font-weight:600">${s.temp}°C</td>
          <td style="color:var(--c-blue)">${s.hum}%</td>
          <td style="color:${precipColor(s.precip)}">${s.precip} mm</td>
          <td style="color:${vientoColor(s.viento)};font-weight:600">
            ${dirArrow(s.direccion)} ${s.viento} km/h
            ${!s.operable ? `<div class="wind-alert">&gt;${VIENTO_LIMITE_RDCFT} km/h</div>` : ''}
          </td>
          <td style="color:var(--c-yellow)">${s.racha} km/h</td>
          <td style="font-size:10px;color:var(--c-text-muted)">${s.direccion}° ${compassLabel(s.direccion)}</td>
          <td style="color:${rdcftColor};font-weight:600;font-size:13px">${rdcftIcon}</td>
        </tr>`;
    }).join('');

    result.innerHTML = `
      <div class="modal-result-header">
        <div class="modal-result-title">📍 ${nombre}</div>
        <div class="modal-result-coords">${lat}, ${lon}</div>
      </div>
      <div class="modal-result-stats">
        <div class="mrs"><div class="mrs-l">Temp. media</div><div class="mrs-v">${avgTemp}°C</div></div>
        <div class="mrs"><div class="mrs-l">Precip. total</div><div class="mrs-v" style="color:var(--c-blue)">${totalPrecip} mm</div></div>
        <div class="mrs"><div class="mrs-l">Viento máx.</div><div class="mrs-v" style="color:${maxViento > VIENTO_LIMITE_RDCFT ? 'var(--c-red)' : 'var(--c-green)'}">${maxViento} km/h</div></div>
        <div class="mrs"><div class="mrs-l">Horas operables</div><div class="mrs-v" style="color:${operables > 0 ? 'var(--c-green)' : 'var(--c-red)'}">${operables} / ${slots24.length}</div></div>
      </div>
      <div class="modal-table-wrap">
        <table class="wtable" style="min-width:500px;">
          <thead>
            <tr>
              <th class="col-day" style="text-align:left;padding-left:0;">Hora</th>
              <th>Cond.</th><th>🌡 Temp.</th><th>💧 Hum.</th>
              <th>🌧 Lluvia</th><th>💨 Viento</th><th>⚡ Racha</th>
              <th>🧭 Direc.</th><th>🔥 RDCFT</th>
            </tr>
          </thead>
          <tbody>${filas}</tbody>
        </table>
      </div>`;

  } catch (err) {
    errDiv.textContent   = `Error: ${err.message}`;
    errDiv.style.display = 'block';
    result.innerHTML     = '';
  } finally {
    btn.textContent = '🔍 Consultar pronóstico';
    btn.disabled    = false;
  }
}