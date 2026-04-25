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
  warn:    'Con restricciones',
  bad:     'No favorable',
  neutral: 'Sin RDCFT programado'
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
  document.getElementById('mainTitle').textContent = 'Resumen operacional semanal';

  // Agrupar paisajes por zona con su estado actual
  const zonasHTML = ZONAS.map(zona => {
    const items = zona.paisajes.map(nombre => {
      const idx    = PAISAJES.findIndex(p => p.n === nombre);
      if (idx === -1) return '';
      const estado = PAISAJE_ESTADO[idx] || 'sin-rdcft';
      const colores = {
        favorable:    'var(--c-green)',
        restriccion:  'var(--c-yellow)',
        'no-favorable': 'var(--c-red)',
        'sin-rdcft':  'var(--c-gray)'
      };
      const etiquetas = {
        favorable:      'Favorable',
        restriccion:    'Con restricciones',
        'no-favorable': 'No favorable',
        'sin-rdcft':    'Sin RDCFT programado'
      };
      const tieneEstado = PAISAJE_ESTADO[idx] !== undefined;
      return `
        <div class="resumen-paisaje" onclick="onSelectPaisaje(${idx})">
          <span class="resumen-dot" style="background:${colores[estado]}"></span>
          <span class="resumen-nombre">${nombre}</span>
          ${tieneEstado ? `<span class="resumen-estado" style="color:${colores[estado]}">${etiquetas[estado]}</span>` : ''}
        </div>`;
    }).join('');

    return `
      <div class="resumen-zona">
        <div class="resumen-zona-titulo">${zona.nombre}</div>
        ${items}
      </div>`;
  }).join('');

  const totalConsultados = Object.keys(PAISAJE_ESTADO).length;
  const favorable   = Object.values(PAISAJE_ESTADO).filter(e => e === 'favorable').length;
  const restriccion = Object.values(PAISAJE_ESTADO).filter(e => e === 'restriccion').length;
  const noFavorable = Object.values(PAISAJE_ESTADO).filter(e => e === 'no-favorable').length;

  const decisionHTML = totalConsultados > 0 ? `
    <div class="decision-stats">
      <div class="dstat"><div class="dstat-v" style="color:var(--c-green)">${favorable}</div><div class="dstat-l">Favorable</div></div>
      <div class="dstat"><div class="dstat-v" style="color:var(--c-yellow)">${restriccion}</div><div class="dstat-l">Con restricciones</div></div>
      <div class="dstat"><div class="dstat-v" style="color:var(--c-red)">${noFavorable}</div><div class="dstat-l">No favorable</div></div>
      <div class="dstat"><div class="dstat-v" style="color:var(--c-gray)">${PAISAJES.length - totalConsultados}</div><div class="dstat-l">Sin consultar</div></div>
    </div>` : `
    <div class="decision-hint">
      Selecciona un paisaje en el panel izquierdo para cargar su pronóstico.<br>
      Los estados se actualizarán automáticamente con datos de Open-Meteo.
    </div>`;

  document.getElementById('detailPanel').innerHTML = `
    <div class="resumen-layout">

      <!-- Panel izquierdo: decisión operacional -->
      <div class="decision-panel">
        <div class="decision-badge">DECISIÓN OPERACIONAL DE LA SEMANA</div>
        <p class="decision-texto">
          Este dashboard informa las condiciones meteorológicas pronosticadas
          que respaldan la toma de decisiones para evaluar la ejecución de
          <strong>Reducción de Combustibles mediante Fuego Técnico (RDCFT)</strong>
          durante los próximos 7 días, para cada Paisaje Productivo Protegido.
        </p>
        <ul class="decision-lista">
          <li>Pronóstico meteorológico semanal por paisaje (10:00 / 15:00 / 18:00)</li>
          <li>Regla operacional: viento &gt; ${VIENTO_LIMITE_RDCFT} km/h impide la ejecución de RDCFT</li>
          <li>Semáforo operacional diario basado en datos reales de Open-Meteo</li>
          <li>Sugerencia operacional por horario</li>
        </ul>
        <div class="decision-seccion">Estado actual de paisajes consultados</div>
        ${decisionHTML}
        <div class="decision-leyenda">
          <div class="dl-item"><span class="resumen-dot" style="background:var(--c-green)"></span>Favorable</div>
          <div class="dl-item"><span class="resumen-dot" style="background:var(--c-yellow)"></span>Con restricciones</div>
          <div class="dl-item"><span class="resumen-dot" style="background:var(--c-red)"></span>No favorable</div>
          <div class="dl-item"><span class="resumen-dot" style="background:var(--c-gray)"></span>Sin RDCFT programado</div>
        </div>
      </div>

      <!-- Panel derecho: lista de paisajes por zona -->
      <div class="resumen-panel">
        <div class="resumen-panel-titulo">PAISAJES</div>
        <p class="resumen-panel-sub">Haz clic en un paisaje para ver su pronóstico detallado.</p>
        <div class="resumen-zonas">${zonasHTML}</div>
      </div>

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
  const days = window.activeWeatherDays || activeWeatherDays;
  if (!days) return;
  const day  = days[idx];
  if (!day) return;

  const DAY_FULL  = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  const MESES_F   = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const dateObj   = new Date(day.date + 'T12:00:00');
  const dayFull   = DAY_FULL[dateObj.getDay()];
  const dayNum    = dateObj.getDate();
  const mes       = MESES_F[dateObj.getMonth()];
  const estado    = estadoDia(day);
  const estColor  = { ok:'var(--c-green)', warn:'var(--c-yellow)', bad:'var(--c-red)', neutral:'var(--c-text-dim)' };
  const estLabel  = { ok:'Favorable', warn:'Con restricciones', bad:'No favorable', neutral:'Sin RDCFT programado' };

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
          <div class="slot-rdcft" style="color:${rdcftColor}">${rdcftIcon} ${s.rdcft.operable ? 'Favorable' : 'No favorable'}</div>
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

  // Insertarlo después del semáforo (dentro de la primera dcard)
  const diasRow = document.querySelector('.dias-row');
  if (diasRow) {
    diasRow.parentNode.insertBefore(panel, diasRow.nextSibling);
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
      <th>🔥 Sugerencia Operacional</th>
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
    const rdcftLabel    = todosOp  ? 'Favorable' : ninguno ? 'No favorable' : 'Con restricciones';
    // Resumen de qué horas son operables
    const horasOp       = day.slots.filter(s => s.rdcft.operable).map(s => s.hora).join(', ');
    const horasNO       = day.slots.filter(s => !s.rdcft.operable).map(s => s.hora).join(', ');
    const rdcftDetalle  = todosOp
      ? `Todas las horas dentro del límite`
      : ninguno
        ? `Viento supera ${VIENTO_LIMITE_RDCFT} km/h en todas las horas`
        : `Favorable: ${horasOp} · No favorable: ${horasNO}`;

    return `
      <tr>
        <td class="col-day">
          <div class="day-cell-name">${dayName}</div>
          <div class="day-cell-date">${dayNum} ${month}</div>
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
  const totalPrecip = days.reduce((s, d) => s + d.slots.reduce((a, x) => a + (x.precip||0), 0), 0);

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
          <div class="ml">Precipitación Total Pronosticada</div>
          <div class="mv" style="color:var(--c-blue)">${totalPrecip.toFixed(1)} mm</div>
        </div>
        <div class="ms">
          <div class="ml">Límite viento</div>
          <div class="mv" style="color:var(--c-orange)">${VIENTO_LIMITE_RDCFT} km/h</div>
        </div>
      </div>
    </div>`;
}

// ── Logo Arauco en base64 ─────────────────────────────────────────────────
const LOGO_ARAUCO = 'data:image/png;base64,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';

// ── Generar PDF propio con diseño limpio ──────────────────────────────────
function descargarPDF(nombrePaisaje) {
  const btn = document.querySelector('.pdf-btn');
  if (btn) { btn.textContent = '⏳ Generando...'; btn.disabled = true; }

  const idx  = activePaisajeIdx;
  const days = activeWeatherDays;
  if (!days || idx === null || idx === undefined) {
    if (btn) { btn.textContent = '⬇ Descargar PDF'; btn.disabled = false; }
    return;
  }

  const p           = PAISAJES[idx];
  const diasOk      = days.filter(d => estadoDia(d) === 'ok').length;
  const diasWarn    = days.filter(d => estadoDia(d) === 'warn').length;
  const diasBad     = days.filter(d => estadoDia(d) === 'bad').length;
  const totalPrecip = days.reduce((s, d) => s + d.slots.reduce((a, x) => a + (x.precip||0), 0), 0);
  const fecha       = new Date().toLocaleDateString('es-CL', {day:'2-digit', month:'long', year:'numeric'});
  const resumen     = generarResumenOperacional(days).replace(/<br><br>/g, ' ');

  const ESTADO_COLOR = { ok: '#1D9E75', warn: '#BA7517', bad: '#E24B4A', none: '#888' };
  const ESTADO_BG    = { ok: '#EAF3DE', warn: '#FAEEDA', bad: '#FCEBEB', none: '#F1EFE8' };
  const ESTADO_LABEL = { ok: 'Favorable', warn: 'Con restricciones', bad: 'No favorable', none: 'Sin RDCFT' };
  const ESTADO_ICON  = { ok: '✓', warn: '!', bad: '✕', none: '-' };

  // Filas de la tabla
  const filas = days.map(d => {
    const slot = d.slots[0] || {};
    const est  = estadoDia(d);
    const color = ESTADO_COLOR[est] || '#888';
    const bg    = ESTADO_BG[est] || '#F1EFE8';
    const label = ESTADO_LABEL[est] || '-';
    return `
      <tr>
        <td style="padding:6px 8px;border-bottom:0.5px solid #eee;font-size:11px;">${d.label}</td>
        <td style="padding:6px 8px;border-bottom:0.5px solid #eee;font-size:11px;text-align:center;">${slot.temp !== undefined ? slot.temp+'°C' : '-'}</td>
        <td style="padding:6px 8px;border-bottom:0.5px solid #eee;font-size:11px;text-align:center;">${slot.hum !== undefined ? slot.hum+'%' : '-'}</td>
        <td style="padding:6px 8px;border-bottom:0.5px solid #eee;font-size:11px;text-align:center;">${slot.precip !== undefined ? slot.precip.toFixed(1)+' mm' : '-'}</td>
        <td style="padding:6px 8px;border-bottom:0.5px solid #eee;font-size:11px;text-align:center;color:${slot.viento > VIENTO_LIMITE_RDCFT ? '#E24B4A' : '#333'};">${slot.viento !== undefined ? slot.viento+' km/h' : '-'}</td>
        <td style="padding:6px 8px;border-bottom:0.5px solid #eee;font-size:11px;text-align:center;">${slot.racha !== undefined ? slot.racha+' km/h' : '-'}</td>
        <td style="padding:6px 8px;border-bottom:0.5px solid #eee;font-size:11px;text-align:center;">
          <span style="background:${bg};color:${color};font-size:9px;padding:2px 7px;border-radius:10px;font-weight:500;">${label}</span>
        </td>
      </tr>`;
  }).join('');

  // Semáforo
  const semaforoCells = days.map(d => {
    const est   = estadoDia(d);
    const color = ESTADO_COLOR[est] || '#888';
    const bg    = ESTADO_BG[est] || '#F1EFE8';
    const icon  = ESTADO_ICON[est] || '-';
    return `
      <td style="width:13%;text-align:center;padding:4px;">
        <div style="background:${bg};border-radius:8px;padding:8px 4px;">
          <div style="font-size:10px;font-weight:500;color:${color};">${d.label.split(' ')[0]}</div>
          <div style="font-size:9px;color:#999;margin:2px 0;">${d.label.split(' ')[1]||''}</div>
          <div style="font-size:18px;color:${color};font-weight:500;">${icon}</div>
          <div style="font-size:8px;color:${color};font-weight:500;">${ESTADO_LABEL[est]||'-'}</div>
        </div>
      </td>`;
  }).join('');

  // Precipitaciones
  let precipRows = '';
  if (window.precipData && window.precipData.estaciones) {
    const ests = Object.entries(window.precipData.estaciones).slice(0, 6);
    precipRows = ests.map(([nombre, datos]) => {
      const vals = Object.values(datos);
      const total = vals.reduce((a,b) => a + (parseFloat(b)||0), 0);
      return `
        <td style="text-align:center;padding:6px;">
          <div style="background:#f0f4f8;border-radius:8px;padding:8px;">
            <div style="font-size:9px;color:#888;margin-bottom:4px;">${nombre}</div>
            <div style="font-size:15px;font-weight:500;color:#185FA5;">${total.toFixed(1)}</div>
            <div style="font-size:9px;color:#888;">mm</div>
          </div>
        </td>`;
    }).join('');
  }

  const html = `
    <div style="font-family:Arial,sans-serif;color:#1a1a1a;background:#fff;padding:28px;max-width:900px;">

      <!-- Header -->
      <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2.5px solid #7a6e65;padding-bottom:14px;margin-bottom:20px;">
        <img src="${LOGO_ARAUCO}" style="height:36px;object-fit:contain;" />
        <div style="text-align:right;">
          <div style="font-size:16px;font-weight:600;">${nombrePaisaje}</div>
          <div style="font-size:11px;color:#888;margin-top:2px;">Informe meteorológico RDCFT · ${fecha}</div>
          <div style="font-size:10px;color:#aaa;margin-top:1px;">Lat: ${p.lat} · Lon: ${p.lon}</div>
        </div>
      </div>

      <!-- Stats -->
      <div style="font-size:10px;font-weight:500;color:#888;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">Resumen operacional semanal</div>
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:20px;">
        <div style="background:#f8f7f5;border-radius:8px;padding:10px 12px;">
          <div style="font-size:10px;color:#888;margin-bottom:4px;">Operables</div>
          <div style="font-size:22px;font-weight:500;color:#1D9E75;">${diasOk}</div>
        </div>
        <div style="background:#f8f7f5;border-radius:8px;padding:10px 12px;">
          <div style="font-size:10px;color:#888;margin-bottom:4px;">Con restricciones</div>
          <div style="font-size:22px;font-weight:500;color:#BA7517;">${diasWarn}</div>
        </div>
        <div style="background:#f8f7f5;border-radius:8px;padding:10px 12px;">
          <div style="font-size:10px;color:#888;margin-bottom:4px;">No operables</div>
          <div style="font-size:22px;font-weight:500;color:#E24B4A;">${diasBad}</div>
        </div>
        <div style="background:#f8f7f5;border-radius:8px;padding:10px 12px;">
          <div style="font-size:10px;color:#888;margin-bottom:4px;">Precip. total</div>
          <div style="font-size:22px;font-weight:500;color:#185FA5;">${totalPrecip.toFixed(1)} mm</div>
        </div>
        <div style="background:#f8f7f5;border-radius:8px;padding:10px 12px;">
          <div style="font-size:10px;color:#888;margin-bottom:4px;">Límite viento</div>
          <div style="font-size:22px;font-weight:500;color:#E8820A;">${VIENTO_LIMITE_RDCFT} km/h</div>
        </div>
      </div>

      <!-- Semáforo -->
      <div style="font-size:10px;font-weight:500;color:#888;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">Ventana operacional — 7 días</div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
        <tr>${semaforoCells}</tr>
      </table>

      <!-- Tabla -->
      <div style="font-size:10px;font-weight:500;color:#888;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">Pronóstico meteorológico — hora 10:00</div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
        <thead>
          <tr style="background:#f0ede8;">
            <th style="padding:7px 8px;text-align:left;font-size:10px;color:#666;font-weight:500;">Día</th>
            <th style="padding:7px 8px;text-align:center;font-size:10px;color:#666;font-weight:500;">Temp.</th>
            <th style="padding:7px 8px;text-align:center;font-size:10px;color:#666;font-weight:500;">Humedad</th>
            <th style="padding:7px 8px;text-align:center;font-size:10px;color:#666;font-weight:500;">Lluvia</th>
            <th style="padding:7px 8px;text-align:center;font-size:10px;color:#666;font-weight:500;">Viento</th>
            <th style="padding:7px 8px;text-align:center;font-size:10px;color:#666;font-weight:500;">Racha</th>
            <th style="padding:7px 8px;text-align:center;font-size:10px;color:#666;font-weight:500;">Estado</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>

      <!-- Comentario -->
      <div style="font-size:10px;font-weight:500;color:#888;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">Comentario operacional</div>
      <div style="background:#f8f7f5;border-left:3px solid #7a6e65;border-radius:0 8px 8px 0;padding:10px 14px;font-size:11px;line-height:1.7;color:#444;margin-bottom:20px;">
        ${resumen}
      </div>

      <!-- Precipitaciones -->
      ${precipRows ? `
      <div style="font-size:10px;font-weight:500;color:#888;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">Precipitaciones históricas — últimos 7 días</div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
        <tr>${precipRows}</tr>
      </table>` : ''}

      <!-- Footer -->
      <div style="border-top:0.5px solid #eee;padding-top:10px;display:flex;justify-content:space-between;font-size:9px;color:#aaa;">
        <span>Datos meteorológicos: Open-Meteo (CC BY 4.0) · Precipitaciones: agrometeorologia.cl</span>
        <span>Generado: ${fecha} · Límite viento RDCFT: ${VIENTO_LIMITE_RDCFT} km/h</span>
      </div>

    </div>`;

  // Crear elemento temporal y generar PDF
  const div = document.createElement('div');
  div.innerHTML = html;
  div.style.position = 'absolute';
  div.style.left = '-9999px';
  document.body.appendChild(div);

  const opt = {
    margin:      [10, 10, 10, 10],
    filename:    `RDCFT_${nombrePaisaje.replace(/ /g,'_')}_${new Date().toLocaleDateString('es-CL').replace(/\//g,'-')}.pdf`,
    image:       { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false },
    jsPDF:       { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  html2pdf().set(opt).from(div).save().then(() => {
    document.body.removeChild(div);
    if (btn) { btn.textContent = '⬇ Descargar PDF'; btn.disabled = false; }
  });
}

// ── Render completo del detalle ───────────────────────────────────────────
function renderDetail(idx, days) {
  const p           = PAISAJES[idx];
  activeWeatherDays        = days;
  window.activeWeatherDays = days;
  activePaisajeIdx  = idx;

  document.getElementById('detailPanel').innerHTML =
    renderOperationalCard(p, days) +
    renderWeatherCard(days, p) +
    renderPrecipCard(p.n);
}

// ── Sección precipitaciones desde agrometeorologia.cl ────────────────────
function renderPrecipCard(nombrePaisaje) {
  if (!window.precipData) return '';

  const porPaisaje = window.precipData.por_paisaje || {};
  const estaciones = porPaisaje[nombrePaisaje];
  const periodo    = window.precipData.periodo || {};
  const generado   = window.precipData.generado || '—';

  if (!estaciones || Object.keys(estaciones).length === 0) {
    return `
      <div class="dcard">
        <div class="sec-label" style="margin-bottom:8px;">Precipitaciones acumuladas — Agrometeorología INIA</div>
        <div style="font-size:11px;color:var(--c-text-dim);padding:10px 0;">
          Sin estaciones asociadas a este paisaje en el período actual.
        </div>
      </div>`;
  }

  // Obtener todas las fechas únicas ordenadas
  const todasFechas = [...new Set(
    Object.values(estaciones).flatMap(dias => Object.keys(dias))
  )].sort();

  // Construir tabla
  const thead = `
    <tr>
      <th style="text-align:left;padding-left:0;font-size:9px;color:var(--c-text-dim);text-transform:uppercase;letter-spacing:.07em;padding-bottom:8px;border-bottom:0.5px solid var(--c-border);">Estación</th>
      ${todasFechas.map(f => {
        const d = new Date(f + 'T12:00:00');
        const dias = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
        return `<th style="text-align:center;font-size:9px;color:var(--c-text-dim);text-transform:uppercase;letter-spacing:.07em;padding-bottom:8px;border-bottom:0.5px solid var(--c-border);">${dias[d.getDay()]}<br>${f.slice(5).replace('-','/')}</th>`;
      }).join('')}
      <th style="text-align:center;font-size:9px;color:var(--c-text-dim);text-transform:uppercase;letter-spacing:.07em;padding-bottom:8px;border-bottom:0.5px solid var(--c-border);">Total</th>
    </tr>`;

  const tbody = Object.entries(estaciones).map(([estacion, dias]) => {
    const total = Object.values(dias).reduce((s, v) => s + (v || 0), 0);
    const celdas = todasFechas.map(f => {
      const val = dias[f];
      const mm  = val !== null && val !== undefined ? val : '—';
      const color = val > 10 ? 'var(--c-blue)' : val > 0 ? 'var(--c-text-muted)' : 'var(--c-text-dim)';
      return `<td style="text-align:center;padding:8px 6px;border-bottom:0.5px solid rgba(255,255,255,0.04);font-size:11px;color:${color};font-weight:${val > 0 ? '600' : '400'}">${mm !== '—' ? mm + ' mm' : '—'}</td>`;
    }).join('');
    const totalColor = total > 20 ? 'var(--c-blue)' : total > 5 ? 'var(--c-text-muted)' : 'var(--c-text-dim)';
    return `
      <tr>
        <td style="text-align:left;padding:8px 0;border-bottom:0.5px solid rgba(255,255,255,0.04);font-size:11px;color:var(--c-text-muted);">${estacion}</td>
        ${celdas}
        <td style="text-align:center;padding:8px 6px;border-bottom:0.5px solid rgba(255,255,255,0.04);font-size:12px;font-weight:600;color:${totalColor}">${total.toFixed(1)} mm</td>
      </tr>`;
  }).join('');

  return `
    <div class="dcard">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;flex-wrap:wrap;gap:6px;">
        <div>
          <div class="sec-label" style="margin-bottom:3px;">Precipitaciones acumuladas — Agrometeorología INIA</div>
          <div style="font-size:9px;color:var(--c-text-dim);">Período: ${periodo.inicio || '—'} → ${periodo.fin || '—'} · Actualizado: ${generado}</div>
        </div>
        <div style="font-size:9px;color:var(--c-text-dim);background:rgba(255,255,255,0.04);border:0.5px solid var(--c-border);border-radius:6px;padding:3px 8px;">
          Fuente: agrometeorologia.cl · INIA
        </div>
      </div>
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;min-width:400px;">
          <thead>${thead}</thead>
          <tbody>${tbody}</tbody>
        </table>
      </div>
    </div>`;
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

  // Cerrar mapa si está abierto
  if (typeof resetMapa === 'function') resetMapa();

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
    const rdcftTexto = s.operable ? 'Favorable' : 'No favorable';
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
          <td style="color:${rdcftColor};font-weight:600;font-size:11px">${rdcftIcon} ${rdcftTexto}</td>
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