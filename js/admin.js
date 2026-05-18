/* ═══════════════════════════════════════════════════════
   admin.js — Lógica de la página de administración RDCFT
   ═══════════════════════════════════════════════════════ */

const SESSION_KEY = 'rdcft_user';

let sesion        = null;
let usuariosDB    = null;
let filtroBusqueda = '';

// ── Utilidades ────────────────────────────────────────────────────────────

function verificarSesion() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch { return null; }
}

function crearCredenciales(s) {
  return btoa(JSON.stringify({ email: s.email, token: s.token, sessionId: s.sessionId }));
}

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function formatLastLogin(iso) {
  if (!iso) return '<span style="color:var(--c-text-dim);font-size:11px;">Nunca</span>';
  const d = new Date(iso), diff = Date.now() - d;
  if (diff < 60000)     return '<span style="color:var(--c-green);font-size:11px;">Ahora</span>';
  if (diff < 3600000)   return `<span style="font-size:11px;">Hace ${Math.floor(diff/60000)} min</span>`;
  if (diff < 86400000)  return `<span style="font-size:11px;">Hoy ${d.toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'})}</span>`;
  if (diff < 172800000) return `<span style="font-size:11px;">Ayer ${d.toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'})}</span>`;
  return `<span style="font-size:11px;">${d.toLocaleDateString('es-CL',{day:'2-digit',month:'2-digit',year:'2-digit'})}</span>`;
}

// ── Carga inicial ─────────────────────────────────────────────────────────

async function cargarDatos() {
  sesion = verificarSesion();
  if (!sesion || sesion.rol !== 'admin') { window.location.href = '/'; return; }

  const emailEl = document.getElementById('apUserEmail');
  if (emailEl) emailEl.textContent = sesion.email;

  try {
    const [respUsuarios, respPendientes] = await Promise.all([
      fetch('/api/token?type=usuarios', { headers: { Authorization: `Bearer ${crearCredenciales(sesion)}` } }),
      fetch('/api/token?type=reset-pendientes', { headers: { Authorization: `Bearer ${crearCredenciales(sesion)}` } })
    ]);

    if (respUsuarios.status === 401) { window.location.href = '/'; return; }
    if (!respUsuarios.ok) throw new Error(`HTTP ${respUsuarios.status}`);

    const dataUsuarios    = await respUsuarios.json();
    const dataPendientes  = await respPendientes.json().catch(() => ({ pendientes: 0 }));

    usuariosDB = dataUsuarios.usuarios || [];
    actualizarStats(dataPendientes.pendientes || 0);
    renderTabla();
  } catch (err) {
    mostrarMensaje('❌ Error cargando datos: ' + err.message, 'error');
  }
}

// ── Stats ─────────────────────────────────────────────────────────────────

function actualizarStats(pendientes) {
  if (!usuariosDB) return;
  const admins = usuariosDB.filter(u => u.rol === 'admin').length;
  document.getElementById('statTotal').textContent    = usuariosDB.length;
  document.getElementById('statAdmins').textContent   = admins;
  document.getElementById('statUsuarios').textContent = usuariosDB.length - admins;
  document.getElementById('statPendientes').textContent = pendientes;
  const card = document.getElementById('statPendientesCard');
  if (card) card.classList.toggle('ap-stat-card--alert', pendientes > 0);
}

// ── Tabla ─────────────────────────────────────────────────────────────────

function renderTabla() {
  const tbody   = document.getElementById('tablaBody');
  const counter = document.getElementById('counter');

  const filtrados = (usuariosDB || []).filter(u =>
    u.email.toLowerCase().includes(filtroBusqueda) ||
    (u.cargo || '').toLowerCase().includes(filtroBusqueda)
  );

  if (counter) counter.textContent = `${filtrados.length} de ${(usuariosDB||[]).length} usuarios`;

  tbody.innerHTML = filtrados.length === 0
    ? `<tr><td colspan="5" class="ap-tabla-empty">No se encontraron usuarios</td></tr>`
    : filtrados.map(u => {
        const idx    = usuariosDB.indexOf(u);
        const esSelf = u.email === sesion.email;
        const esAdmin = u.rol === 'admin';
        return `
          <tr>
            <td>${escapeHtml(u.email)}</td>
            <td><span class="rol-badge rol-${escapeHtml(u.rol)}">${esAdmin ? '⭐ Admin' : '👤 Usuario'}</span></td>
            <td><input class="ap-cargo-input" value="${escapeHtml(u.cargo || '')}" placeholder="—" oninput="editarCargo(${idx},this.value)"/></td>
            <td>${formatLastLogin(u.lastlogin)}</td>
            <td class="ap-acciones">
              ${!esSelf ? `
                <button class="btn-rol ${esAdmin ? 'btn-quitar' : 'btn-dar'}" onclick="cambiarRol(${idx})">
                  ${esAdmin ? '⬇ Usuario' : '⬆ Admin'}
                </button>
                <button class="btn-logout" onclick="forzarLogout(${idx})" title="Cerrar sesión activa">&#x21A9; Logout</button>
                <button class="btn-del" onclick="eliminarUsuario(${idx})" title="Eliminar">&#x2715;</button>
              ` : '<span class="self-label">Tú</span>'}
            </td>
          </tr>
        `;
      }).join('');
}

function buscar(val) {
  filtroBusqueda = val.toLowerCase();
  renderTabla();
}

// ── Acciones ──────────────────────────────────────────────────────────────

async function cambiarRol(idx) {
  const u = usuariosDB[idx];
  const nuevoRol = u.rol === 'admin' ? 'usuario' : 'admin';
  if (nuevoRol === 'admin' && usuariosDB.filter(u => u.rol === 'admin').length >= 5) {
    alert('Máximo 5 administradores permitidos'); return;
  }
  usuariosDB[idx].rol = nuevoRol;
  renderTabla();
  await guardarUsuarios();
}

function editarCargo(idx, valor) {
  usuariosDB[idx].cargo = valor.trim();
}

async function forzarLogout(idx) {
  const u = usuariosDB[idx];
  if (!confirm(`¿Cerrar la sesión activa de ${u.email}?`)) return;
  try {
    const resp = await fetch('/api/usuarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${crearCredenciales(sesion)}` },
      body: JSON.stringify({ action: 'force-logout', email: u.email })
    });
    if (!resp.ok) { const e = await resp.json().catch(() => ({})); throw new Error(e.error || `Error ${resp.status}`); }
    mostrarMensaje(`Sesión de ${u.email} cerrada. Deberá volver a iniciar sesión.`, 'success');
  } catch (err) {
    mostrarMensaje('❌ ' + err.message, 'error');
  }
}

async function agregarUsuario() {
  const emailEl = document.getElementById('nuevoEmail');
  const rolEl   = document.getElementById('nuevoRol');
  const cargoEl = document.getElementById('nuevoCargo');
  const errEl   = document.getElementById('formError');
  const email   = (emailEl.value || '').trim().toLowerCase();
  const rol     = rolEl.value;
  const cargo   = cargoEl.value.trim();
  errEl.style.display = 'none';

  if (!email.endsWith('@arauco.com')) {
    errEl.textContent = 'Solo se permiten correos @arauco.com'; errEl.style.display = 'block'; return;
  }
  if (usuariosDB.find(u => u.email === email)) {
    errEl.textContent = 'Este correo ya está registrado'; errEl.style.display = 'block'; return;
  }
  if (rol === 'admin' && usuariosDB.filter(u => u.rol === 'admin').length >= 5) {
    errEl.textContent = 'Máximo 5 administradores permitidos'; errEl.style.display = 'block'; return;
  }

  usuariosDB.push({ email, rol, cargo });
  emailEl.value = ''; cargoEl.value = '';
  renderTabla();
  actualizarStats(0);
  await guardarUsuarios();
}

async function eliminarUsuario(idx) {
  if (!confirm(`¿Eliminar a ${usuariosDB[idx].email}?`)) return;
  usuariosDB.splice(idx, 1);
  renderTabla();
  actualizarStats(0);
  await guardarUsuarios();
}

async function guardarUsuarios() {
  const btn = document.getElementById('btnGuardar');
  if (btn) { btn.textContent = '⏳ Guardando...'; btn.disabled = true; }
  try {
    const resp = await fetch('/api/usuarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${crearCredenciales(sesion)}` },
      body: JSON.stringify({ usuarios: usuariosDB })
    });
    if (!resp.ok) { const e = await resp.json().catch(() => ({})); throw new Error(e.error || `Error ${resp.status}`); }

    // Si el admin cambió su propio cargo o rol, actualizar sessionStorage
    const self = usuariosDB.find(u => u.email === sesion.email);
    if (self && (self.cargo !== sesion.cargo || self.rol !== sesion.rol)) {
      sesion.cargo = self.cargo;
      sesion.rol   = self.rol;
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(sesion));
    }

    mostrarMensaje('✅ Usuarios actualizados correctamente.', 'success');
  } catch (err) {
    mostrarMensaje('❌ ' + err.message, 'error');
  } finally {
    if (btn) { btn.textContent = '💾 Guardar cambios'; btn.disabled = false; }
  }
}

function exportarCSV() {
  if (!usuariosDB || !usuariosDB.length) { mostrarMensaje('No hay usuarios para exportar.', 'error'); return; }
  const header = ['Correo', 'Rol', 'Cargo'];
  const rows   = usuariosDB.map(u => [u.email, u.rol, u.cargo || '']);
  const csv    = [header, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(';')).join('\n');
  const blob   = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url    = URL.createObjectURL(blob);
  const a      = document.createElement('a');
  a.href = url; a.download = `usuarios_rdcft_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function mostrarMensaje(msg, tipo) {
  const div = document.getElementById('mensaje');
  if (!div) return;
  div.textContent = msg;
  div.className   = `ap-mensaje ap-mensaje--${tipo}`;
  div.style.display = 'block';
  if (tipo !== 'error') setTimeout(() => { div.style.display = 'none'; }, 6000);
}

// ── Validación de sesión remota ───────────────────────────────────────────

let _adminSesionTimer = null;

async function validarSesionAdmin() {
  const s = verificarSesion();
  if (!s?.sessionId) { window.location.href = '/'; return; }
  try {
    const resp = await fetch('/api/ping-sesion', {
      headers: { Authorization: `Bearer ${crearCredenciales(s)}` },
      signal: AbortSignal.timeout(8000)
    });
    if (resp.status === 401) window.location.href = '/';
  } catch {}
}

function iniciarPollAdmin_sesion() {
  validarSesionAdmin();
  _adminSesionTimer = setInterval(validarSesionAdmin, 15000);
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') validarSesionAdmin();
});
window.addEventListener('focus', validarSesionAdmin);

// ── Tabs ──────────────────────────────────────────────────────────────────

let tabActual = 'usuarios';

function switchTab(tab) {
  tabActual = tab;
  document.getElementById('tabUsuarios').classList.toggle('active', tab === 'usuarios');
  document.getElementById('tabAuditoria').classList.toggle('active', tab === 'auditoria');

  const secUs = document.querySelectorAll('.ap-stats, .ap-section:not(#seccionAuditoria)');
  const secAu = document.getElementById('seccionAuditoria');

  secUs.forEach(el => el.style.display = tab === 'usuarios' ? '' : 'none');
  secAu.style.display = tab === 'auditoria' ? '' : 'none';

  if (tab === 'auditoria') cargarAuditoria();
}

// ── Auditoría ─────────────────────────────────────────────────────────────

let auditLog     = [];
let auditFiltro  = '';

const ACCION_LABEL = {
  agregar:       { txt: 'Agregar usuario',   cls: 'audit-add'    },
  eliminar:      { txt: 'Eliminar usuario',  cls: 'audit-del'    },
  cambiar_rol:   { txt: 'Cambiar rol',       cls: 'audit-rol'    },
  cambiar_cargo: { txt: 'Cambiar cargo',     cls: 'audit-cargo'  },
  forzar_logout: { txt: 'Forzar logout',     cls: 'audit-logout' },
};

function formatFecha(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('es-CL', { day:'2-digit', month:'2-digit', year:'numeric' })
    + ' ' + d.toLocaleTimeString('es-CL', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
}

async function cargarAuditoria() {
  const tbody = document.getElementById('auditBody');
  tbody.innerHTML = '<tr><td colspan="5" class="ap-tabla-loading">Cargando…</td></tr>';

  try {
    const resp = await fetch('/api/auditoria', {
      headers: { Authorization: `Bearer ${crearCredenciales(sesion)}` }
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    auditLog = data.log || [];
    renderAuditoria();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" class="ap-tabla-empty">❌ Error cargando auditoría: ${escapeHtml(err.message)}</td></tr>`;
  }
}

function filtrarAudit(val) {
  auditFiltro = val.toLowerCase();
  renderAuditoria();
}

function renderAuditoria() {
  const tbody   = document.getElementById('auditBody');
  const counter = document.getElementById('auditCounter');

  const filtrados = auditLog.filter(e =>
    !auditFiltro ||
    (e.usuario || '').toLowerCase().includes(auditFiltro) ||
    (e.accion  || '').toLowerCase().includes(auditFiltro) ||
    (e.admin   || '').toLowerCase().includes(auditFiltro) ||
    (e.detalle || '').toLowerCase().includes(auditFiltro)
  );

  if (counter) counter.textContent = `${filtrados.length} de ${auditLog.length} registros`;

  if (filtrados.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="ap-tabla-empty">Sin registros de actividad aún.</td></tr>';
    return;
  }

  tbody.innerHTML = filtrados.map(e => {
    const info = ACCION_LABEL[e.accion] || { txt: e.accion, cls: '' };
    return `
      <tr>
        <td class="audit-fecha">${formatFecha(e.fecha)}</td>
        <td><span class="audit-badge ${info.cls}">${info.txt}</span></td>
        <td class="audit-email">${escapeHtml(e.usuario || '—')}</td>
        <td class="audit-detalle">${escapeHtml(e.detalle || '—')}</td>
        <td class="audit-admin">${escapeHtml(e.admin || '—')}</td>
      </tr>
    `;
  }).join('');
}

// ── Init ──────────────────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', () => {
  cargarDatos();
  iniciarPollAdmin_sesion();
});
