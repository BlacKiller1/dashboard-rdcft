// ═══════════════════════════════════════════════════════════════════════
//  weather.js
//  Integración con Open-Meteo API + Reglas operacionales RDCFT
//
//  📌 REGLA OPERACIONAL:
//     Viento > 10 km/h → NO es posible realizar RDCFT
//     Esta regla se aplica automáticamente a cada slot horario
//     y genera un estado operacional basado en datos reales de la API.
// ═══════════════════════════════════════════════════════════════════════

// ── Variables que pedimos a la API ──────────────────────────────────────
const HOURLY_VARS = [
  'temperature_2m',       // Temperatura a 2m (°C)
  'relativehumidity_2m',  // Humedad relativa (%)
  'precipitation',        // Lluvia acumulada (mm)
  'windspeed_10m',        // Velocidad del viento a 10m (km/h)
  'windgusts_10m',        // Racha máxima (km/h)
  'winddirection_10m',    // Dirección del viento (°)
  'weathercode'           // Código WMO de condición climática
].join(',');

// ── Horas a mostrar en la tabla ─────────────────────────────────────────
const TARGET_HOURS = ['10:00', '15:00', '18:00'];

// ── Umbral operacional de viento para RDCFT ─────────────────────────────
//    ⚠️ Si el viento supera este valor, NO se puede operar
const VIENTO_LIMITE_RDCFT = 10; // km/h

// ═══════════════════════════════════════════════════════════════════════
//  REGLA OPERACIONAL RDCFT
//  Evalúa si un slot horario permite o no operar
//
//  Retorna un objeto con:
//    operable  → true/false
//    estado    → 'ok' | 'no-operable'
//    razon     → string explicativo (se muestra en la UI)
// ═══════════════════════════════════════════════════════════════════════
function evaluarRDCFT(slot) {
  // Regla 1 — Viento sobre el límite
  if (slot.viento > VIENTO_LIMITE_RDCFT) {
    return {
      operable: false,
      estado:   'no-operable',
      razon:    `Viento ${slot.viento} km/h supera el límite de ${VIENTO_LIMITE_RDCFT} km/h`
    };
  }

  // Todas las condiciones son favorables
  return {
    operable: true,
    estado:   'operable',
    razon:    `Viento ${slot.viento} km/h — dentro del límite operacional`
  };
}

// ═══════════════════════════════════════════════════════════════════════
//  LLAMADA A LA API
// ═══════════════════════════════════════════════════════════════════════
async function fetchWeather(lat, lon) {
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}` +
    `&longitude=${lon}` +
    `&hourly=${HOURLY_VARS}` +
    `&timezone=America%2FSantiago` +
    `&forecast_days=7` +
    `&wind_speed_unit=kmh`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Error HTTP ${res.status}`);
  return await res.json();
}

// ═══════════════════════════════════════════════════════════════════════
//  PARSEAR RESPUESTA
//  Extrae horas 10:00 / 15:00 / 18:00 por día
//  y aplica la regla RDCFT a cada slot
// ═══════════════════════════════════════════════════════════════════════
function parseHourly(apiData) {
  const h    = apiData.hourly;
  const days = {};

  h.time.forEach((t, i) => {
    const [date, timeStr] = t.split('T');
    if (!TARGET_HOURS.includes(timeStr)) return;

    if (!days[date]) days[date] = [];

    const slot = {
      hora:      timeStr,
      temp:      Math.round(h.temperature_2m[i]),
      hum:       Math.round(h.relativehumidity_2m[i]),
      precip:    +(h.precipitation[i]).toFixed(1),
      viento:    Math.round(h.windspeed_10m[i]),
      racha:     Math.round(h.windgusts_10m[i]),
      direccion: Math.round(h.winddirection_10m[i]),
      codigo:    h.weathercode[i]
    };

    // ✅ Aplicar regla operacional RDCFT
    slot.rdcft = evaluarRDCFT(slot);

    days[date].push(slot);
  });

  return Object.entries(days).map(([date, slots]) => ({ date, slots }));
}

// ═══════════════════════════════════════════════════════════════════════
//  HELPERS DE PRESENTACIÓN
// ═══════════════════════════════════════════════════════════════════════

// WMO weathercode → emoji
function codigoIcono(code) {
  if (code === 0)               return '☀️';
  if (code <= 2)                return '🌤️';
  if (code === 3)               return '☁️';
  if (code >= 45 && code <= 48) return '🌫️';
  if (code >= 51 && code <= 57) return '🌦️';
  if (code >= 61 && code <= 67) return '🌧️';
  if (code >= 71 && code <= 77) return '❄️';
  if (code >= 80 && code <= 82) return '🌧️';
  if (code >= 85 && code <= 86) return '🌨️';
  if (code >= 95)               return '⛈️';
  return '🌡️';
}

// Grados → flecha hacia DONDE VA el viento
// La API entrega la dirección de ORIGEN (ej: 0° = viento del Norte, va hacia el Sur)
// Por eso sumamos 180° para invertir y apuntar hacia el destino
function dirArrow(deg) {
  const destino = (deg + 180) % 360;
  const dirs = ['↑','↗','→','↘','↓','↙','←','↖'];
  return dirs[Math.round(destino / 45) % 8];
}

// Grados → punto cardinal de DESTINO del viento
function compassLabel(deg) {
  const destino = (deg + 180) % 360;
  const labels = ['S','SO','O','NO','N','NE','E','SE'];
  return labels[Math.round(destino / 45) % 8];
}

// Temperatura → color
function tempColor(t) {
  if (t >= 28) return '#E8520A';
  if (t >= 22) return '#D4A017';
  if (t >= 15) return '#f0ede6';
  return '#4A9EE8';
}

// Precipitación → color
function precipColor(p) {
  if (p === 0) return 'var(--c-text-dim)';
  if (p < 2)   return 'var(--c-yellow)';
  if (p < 8)   return '#4A9EE8';
  return 'var(--c-red)';
}

// Viento → color según regla RDCFT
function vientoColor(v) {
  if (v > VIENTO_LIMITE_RDCFT) return 'var(--c-red)';    // Fuera de límite
  if (v > 7)                   return 'var(--c-yellow)'; // Zona de precaución
  return 'var(--c-green)';                               // Dentro del límite
}

// ── Cálculos de resumen ─────────────────────────────────────────────────
function calcAvgTemp(days) {
  let sum = 0, cnt = 0;
  days.forEach(d => d.slots.forEach(s => { sum += s.temp; cnt++; }));
  return cnt ? (sum / cnt).toFixed(1) : '—';
}

function calcTotalPrecip(days) {
  let sum = 0;
  days.forEach(d => d.slots.forEach(s => { sum += s.precip; }));
  return sum.toFixed(1);
}

// Cuenta cuántos slots del día permiten RDCFT según viento real
function calcSlotsDia(day) {
  const operables    = day.slots.filter(s => s.rdcft.operable).length;
  const noOperables  = day.slots.filter(s => !s.rdcft.operable).length;
  return { operables, noOperables, total: day.slots.length };
}