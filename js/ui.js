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
  'no-favorable': 'No favorable'
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
  neutral: 'Sin datos'
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
      return `
        <div class="p-item${activeIdx === idx ? ' active' : ''}" onclick="onSelectPaisaje(${idx})">
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
        favorable:      'var(--c-green)',
        restriccion:    'var(--c-yellow)',
        'no-favorable': 'var(--c-red)',
        'sin-rdcft':    'var(--c-gray)'
      };
      const etiquetas = {
        favorable:      'Favorable',
        restriccion:    'Con restricciones',
        'no-favorable': 'No favorable'
      };
      const tieneEstado = PAISAJE_ESTADO[idx] !== undefined;
      return `
        <div class="resumen-paisaje" onclick="onSelectPaisaje(${idx})">
          <span class="resumen-dot" style="background:${colores[estado]}"></span>
          <span class="resumen-nombre">${nombre}</span>
        </div>`;
    }).join('');

    return `
      <div class="resumen-zona">
        <div class="resumen-zona-titulo">${zona.nombre}</div>
        ${items}
      </div>`;
  }).join('');


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
        <div class="decision-leyenda">
          <div class="dl-item"><span class="resumen-dot" style="background:var(--c-green)"></span>Favorable</div>
          <div class="dl-item"><span class="resumen-dot" style="background:var(--c-yellow)"></span>Con restricciones</div>
          <div class="dl-item"><span class="resumen-dot" style="background:var(--c-red)"></span>No favorable</div>
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
  const estLabel  = { ok:'Favorable', warn:'Con restricciones', bad:'No favorable', neutral:'Sin datos' };

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

// ── Logo Arauco ───────────────────────────────────────────────────────────
const LOGO_ARAUCO_B64 = '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';

// ── Generar PDF diseño profesional fondo blanco ────────────────────────────
async function descargarPDF(nombrePaisaje) {
  const btn = document.querySelector('.pdf-btn');
  if (btn) { btn.textContent = '⏳ Generando...'; btn.disabled = true; }

  // iOS Safari bloquea window.open() tras await — abrir ventana aquí (gesto del usuario)
  const esIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const ventanaIOS = esIOS ? window.open('', '_blank') : null;

  try {
    const idx  = activePaisajeIdx;
    const days = activeWeatherDays;
    if (!days || idx === null) throw new Error('Sin datos');

    const p           = PAISAJES[idx];
    const diasOk      = days.filter(d => estadoDia(d) === 'ok').length;
    const diasWarn    = days.filter(d => estadoDia(d) === 'warn').length;
    const diasBad     = days.filter(d => estadoDia(d) === 'bad').length;
    const totalPrecip = days.reduce((s,d) => s + d.slots.reduce((a,x) => a+(x.precip||0),0), 0);
    const resumen     = generarResumenOperacional(days).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
    const fecha       = new Date().toLocaleDateString('es-CL',{day:'2-digit',month:'long',year:'numeric'});

    const ECOLOR = { ok:'#1D9E75', warn:'#BFB800', bad:'#E24B4A', neutral:'#696158' };
    const EBG    = { ok:'#EAF3DE', warn:'#F5F2D0', bad:'#FCEBEB', neutral:'#EDE8DF' };
    const ELABEL = { ok:'Favorable', warn:'Con restricciones', bad:'No favorable', neutral:'Sin RDCFT' };
    const EICON  = { ok:'✓', warn:'!', bad:'✕', neutral:'-' };
    const DAYS   = ['DOM','LUN','MAR','MIÉ','JUE','VIE','SÁB'];
    const MONTHS = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    const HORAS  = ['10:00','15:00','18:00'];

    // Filas tabla con 3 horarios por día
    const filas = days.map(d => {
      const est     = estadoDia(d);
      const dateObj = new Date(d.date + 'T12:00:00');
      const dLabel  = DAYS[dateObj.getDay()] + ' ' + dateObj.getDate() + ' ' + MONTHS[dateObj.getMonth()];
      const ecolor  = ECOLOR[est]||'#888';
      const ebg     = EBG[est]||'#F1EFE8';

      // Fila del día
      const slotRows = d.slots.map((slot, si) => {
        const vcolor = (slot.viento||0) > VIENTO_LIMITE_RDCFT ? '#E24B4A' : '#1D9E75';
        const slotEst = slot.rdcft && slot.rdcft.operable ? 'ok' : 'bad';
        return `<tr style="background:#fff;">
          <td style="padding:2px 6px 2px 14px;font-size:8.5px;color:#aaa;border-bottom:0.5px solid #f0f0f0;">${HORAS[si]||''}</td>
          <td style="padding:2px 6px;font-size:8.5px;text-align:center;color:#333;border-bottom:0.5px solid #f0f0f0;">${slot.temp!==undefined?slot.temp+'°C':'-'}</td>
          <td style="padding:2px 6px;font-size:8.5px;text-align:center;color:#696158;border-bottom:0.5px solid #f0f0f0;">${slot.hum!==undefined?slot.hum+'%':'-'}</td>
          <td style="padding:2px 6px;font-size:8.5px;text-align:center;color:#696158;border-bottom:0.5px solid #f0f0f0;">${slot.precip!==undefined?slot.precip.toFixed(1)+' mm':'-'}</td>
          <td style="padding:2px 6px;font-size:8.5px;text-align:center;color:${vcolor};font-weight:600;border-bottom:0.5px solid #f0f0f0;">${slot.viento!==undefined?slot.viento+' km/h':'-'}</td>
          <td style="padding:2px 6px;font-size:8.5px;text-align:center;color:#EA7600;border-bottom:0.5px solid #f0f0f0;">${slot.racha!==undefined?slot.racha+' km/h':'-'}</td>
          <td style="padding:2px 6px;text-align:center;border-bottom:0.5px solid #f0f0f0;">
            <span style="background:${EBG[slotEst]};color:${ECOLOR[slotEst]};font-size:7.5px;padding:1px 5px;border-radius:6px;font-weight:700;">${ELABEL[slotEst]}</span>
          </td>
        </tr>`;
      }).join('');

      return `<tr style="background:#EDE8DF;">
        <td colspan="7" style="padding:3px 8px;font-size:9px;font-weight:700;color:#333;border-top:1px solid #DFD1A7;border-bottom:0.5px solid #DFD1A7;">
          <span style="margin-right:8px;">${dLabel}</span>
          <span style="background:${ebg};color:${ecolor};font-size:7.5px;padding:1px 6px;border-radius:6px;font-weight:700;">${ELABEL[est]||'-'}</span>
        </td>
      </tr>${slotRows}`;
    }).join('');

    // Semáforo
    const semaforo = days.map(d => {
      const est     = estadoDia(d);
      const dateObj = new Date(d.date + 'T12:00:00');
      const ecolor  = ECOLOR[est]||'#888';
      const ebg     = EBG[est]||'#F1EFE8';
      return `<div style="flex:1;text-align:center;background:${ebg};border-radius:7px;padding:7px 3px;">
        <div style="font-size:9.5px;font-weight:800;color:${ecolor};">${DAYS[dateObj.getDay()]}</div>
        <div style="font-size:7.5px;color:#aaa;margin:1px 0;">${dateObj.getDate()}/${dateObj.getMonth()+1}</div>
        <div style="font-size:18px;line-height:1.1;color:${ecolor};font-weight:700;">${EICON[est]||'-'}</div>
        <div style="font-size:7px;color:${ecolor};font-weight:700;margin-top:1px;">${ELABEL[est]||'-'}</div>
      </div>`;
    }).join('');

    // Precipitaciones históricas — tabla estaciones × fechas
    let precipHTML = '';
    const precipPaisaje = window.precipData && window.precipData.por_paisaje && window.precipData.por_paisaje[nombrePaisaje];
    if (precipPaisaje) {
      const ests   = Object.entries(precipPaisaje);
      const fechas = ests.length ? Object.keys(ests[0][1]).sort() : [];
      const DAYS_S = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

      const thFechas = fechas.map(f => {
        const d = new Date(f + 'T12:00:00');
        return `<th style="padding:3px 4px;text-align:center;font-size:7.5px;color:#696158;font-weight:700;background:#DFD1A7;">${DAYS_S[d.getDay()]}<br><span style="font-weight:400;color:#8a7f72;">${d.getDate()}/${d.getMonth()+1}</span></th>`;
      }).join('');

      const filasPrecip = ests.map(([nom, datos]) => {
        const tds = fechas.map(f => {
          const vf = (datos[f] !== null && datos[f] !== undefined) ? parseFloat(datos[f]) : null;
          const c  = vf === null ? '#ccc' : vf === 0 ? '#bbb' : vf < 5 ? '#EA7600' : '#696158';
          const fw = vf > 0 ? '700' : '400';
          return `<td style="padding:2px 4px;text-align:center;border-bottom:0.5px solid #f0f0f0;font-size:8px;color:${c};font-weight:${fw};">${vf !== null ? vf.toFixed(1) : '—'}</td>`;
        }).join('');
        const total = fechas.reduce((a, f) => a + (parseFloat(datos[f]) || 0), 0);
        const tc = total === 0 ? '#bbb' : total < 10 ? '#EA7600' : '#696158';
        return `<tr>
          <td style="padding:2px 6px;font-size:8px;font-weight:600;color:#333;border-bottom:0.5px solid #f0f0f0;white-space:nowrap;">${nom}</td>
          ${tds}
          <td style="padding:2px 6px;text-align:center;font-size:8.5px;font-weight:700;color:${tc};border-bottom:0.5px solid #f0f0f0;border-left:1px solid #DFD1A7;">${total.toFixed(1)}</td>
        </tr>`;
      }).join('');

      const per = window.precipData.periodo;
      const perLabel = per ? `${per.inicio} al ${per.fin}` : 'última semana';
      precipHTML = `
        <div style="font-size:7.5px;font-weight:700;color:#696158;text-transform:uppercase;letter-spacing:0.1em;margin:10px 0 6px;">Precipitaciones históricas — ${perLabel}</div>
        <table style="width:100%;border-collapse:collapse;margin-bottom:10px;">
          <thead><tr>
            <th style="padding:3px 6px;text-align:left;font-size:7.5px;color:#696158;font-weight:700;background:#DFD1A7;">Estación</th>
            ${thFechas}
            <th style="padding:3px 6px;text-align:center;font-size:7.5px;color:#696158;font-weight:700;background:#DFD1A7;border-left:1px solid #c8bea8;">Total mm</th>
          </tr></thead>
          <tbody>${filasPrecip}</tbody>
        </table>`;
    }

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; padding: 0; font-family: Arial, sans-serif; background: #fff; }
    </style>
    </head><body>
    <div style="padding:16px 22px;background:#fff;max-width:860px;">

      <!-- HEADER -->
      <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #696158;padding-bottom:10px;margin-bottom:12px;">
        <img src="data:image/png;base64,${LOGO_ARAUCO_B64}" style="height:34px;object-fit:contain;background:transparent;"/>
        <div style="text-align:right;">
          <div style="font-size:17px;font-weight:800;color:#1a1a1a;letter-spacing:-0.3px;">${nombrePaisaje}</div>
          <div style="font-size:8.5px;color:#696158;margin-top:2px;">Informe RDCFT · Lat ${p.lat} · Lon ${p.lon} · Límite viento ${VIENTO_LIMITE_RDCFT} km/h</div>
          <div style="font-size:8.5px;color:#aaa;margin-top:1px;">${fecha}</div>
        </div>
      </div>

      <!-- KPI -->
      <div style="font-size:7.5px;font-weight:700;color:#696158;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:7px;">Resumen operacional semanal</div>
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-bottom:12px;">
        <div style="background:#EDE8DF;border-radius:7px;padding:7px 10px;border-top:3px solid #1D9E75;">
          <div style="font-size:7.5px;color:#696158;margin-bottom:3px;font-weight:600;">Días operables</div>
          <div style="font-size:24px;font-weight:800;color:#1D9E75;line-height:1;">${diasOk}</div>
        </div>
        <div style="background:#EDE8DF;border-radius:7px;padding:7px 10px;border-top:3px solid #BFB800;">
          <div style="font-size:7.5px;color:#696158;margin-bottom:3px;font-weight:600;">Con restricciones</div>
          <div style="font-size:24px;font-weight:800;color:#BFB800;line-height:1;">${diasWarn}</div>
        </div>
        <div style="background:#EDE8DF;border-radius:7px;padding:7px 10px;border-top:3px solid #E24B4A;">
          <div style="font-size:7.5px;color:#696158;margin-bottom:3px;font-weight:600;">No operables</div>
          <div style="font-size:24px;font-weight:800;color:#E24B4A;line-height:1;">${diasBad}</div>
        </div>
        <div style="background:#EDE8DF;border-radius:7px;padding:7px 10px;border-top:3px solid #696158;">
          <div style="font-size:7.5px;color:#696158;margin-bottom:3px;font-weight:600;">Precip. total pronosticada</div>
          <div style="font-size:17px;font-weight:800;color:#696158;line-height:1;">${totalPrecip.toFixed(1)} mm</div>
        </div>
        <div style="background:#EDE8DF;border-radius:7px;padding:7px 10px;border-top:3px solid #EA7600;">
          <div style="font-size:7.5px;color:#696158;margin-bottom:3px;font-weight:600;">Límite viento</div>
          <div style="font-size:17px;font-weight:800;color:#EA7600;line-height:1;">${VIENTO_LIMITE_RDCFT} km/h</div>
        </div>
      </div>

      <!-- SEMÁFORO -->
      <div style="font-size:7.5px;font-weight:700;color:#696158;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:7px;">Ventana operacional — 7 días</div>
      <div style="display:flex;gap:5px;margin-bottom:12px;">${semaforo}</div>

      <!-- PRONÓSTICO -->
      <div style="font-size:7.5px;font-weight:700;color:#696158;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:7px;">Pronóstico meteorológico por horario</div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:12px;">
        <thead>
          <tr style="background:#DFD1A7;">
            <th style="padding:4px 8px;text-align:left;font-size:7.5px;color:#696158;font-weight:700;">Día / Hora</th>
            <th style="padding:4px 8px;text-align:center;font-size:7.5px;color:#696158;font-weight:700;">Temp.</th>
            <th style="padding:4px 8px;text-align:center;font-size:7.5px;color:#696158;font-weight:700;">Humedad</th>
            <th style="padding:4px 8px;text-align:center;font-size:7.5px;color:#696158;font-weight:700;">Lluvia</th>
            <th style="padding:4px 8px;text-align:center;font-size:7.5px;color:#696158;font-weight:700;">Viento</th>
            <th style="padding:4px 8px;text-align:center;font-size:7.5px;color:#696158;font-weight:700;">Racha</th>
            <th style="padding:4px 8px;text-align:center;font-size:7.5px;color:#696158;font-weight:700;">Estado RDCFT</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>

      <!-- COMENTARIO -->
      <div style="font-size:7.5px;font-weight:700;color:#696158;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:7px;">Comentario operacional</div>
      <div style="background:#EDE8DF;border-left:3px solid #696158;padding:8px 12px;font-size:9px;line-height:1.65;color:#444;margin-bottom:12px;border-radius:0 7px 7px 0;">
        ${resumen}
      </div>

      ${precipHTML}

      <!-- FOOTER -->
      <div style="border-top:1px solid #DFD1A7;padding-top:7px;display:flex;justify-content:space-between;font-size:7px;color:#aaa;">
        <span>Datos meteorológicos: Open-Meteo (CC BY 4.0) · Precipitaciones: agrometeorologia.cl</span>
        <span>Generado: ${fecha}</span>
      </div>
    </div></body></html>`;

    // Extraer sólo el body — compatible con móvil (iframe.contentDocument falla en iOS)
    const bodyMatch = html.match(/<body>([\s\S]*)<\/body>/);
    const bodyHTML  = bodyMatch ? bodyMatch[1] : html;

    const tmpDiv = document.createElement('div');
    tmpDiv.style.cssText = 'position:absolute;left:-9999px;top:0;width:900px;background:#fff;';
    tmpDiv.innerHTML = bodyHTML;
    document.body.appendChild(tmpDiv);

    await new Promise(r => setTimeout(r, 800));

    const canvas = await html2canvas(tmpDiv, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      allowTaint: true,
      logging: false,
      windowWidth: 900
    });

    document.body.removeChild(tmpDiv);

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
      let yOffset = 0;
      while (yOffset < imgH) {
        if (yOffset > 0) pdf.addPage();
        const srcY = (yOffset / imgH) * canvas.height;
        const srcH = Math.min((pdfH / imgH) * canvas.height, canvas.height - srcY);
        const pc   = document.createElement('canvas');
        pc.width   = canvas.width; pc.height = srcH;
        pc.getContext('2d').drawImage(canvas, 0, srcY, canvas.width, srcH, 0, 0, canvas.width, srcH);
        const ah = (srcH * imgW) / canvas.width;
        pdf.addImage(pc.toDataURL('image/jpeg',0.97), 'JPEG', 0, 0, imgW, ah);
        yOffset += pdfH;
      }
    }

    if (esIOS && ventanaIOS) {
      const blob    = pdf.output('blob');
      const blobUrl = URL.createObjectURL(blob);
      ventanaIOS.location.href = blobUrl;
      setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
    } else {
      if (ventanaIOS) ventanaIOS.close();
      pdf.save('RDCFT_' + nombrePaisaje.replace(/ /g,'_') + '.pdf');
    }

  } catch(err) {
    if (ventanaIOS) ventanaIOS.close();
    console.error('[PDF]', err);
    alert('Error al generar PDF: ' + err.message);
  } finally {
    if (btn) { btn.textContent = '⬇ Descargar PDF'; btn.disabled = false; }
  }
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