/* ═══════════════════════════════════════════════════════════════════════
   login.js — Autenticación con base de datos de usuarios y roles
   Dashboard Meteorológico RDCFT — Arauco
   ═══════════════════════════════════════════════════════════════════════ */

const SESSION_KEY = 'rdcft_user';
const LOCK_KEY    = 'rdcft_session_lock';
const ES_LOCAL    = window.location.hostname === 'localhost'
                 || window.location.hostname === '127.0.0.1'
                 || window.location.protocol === 'file:';

// ── Control de sesión única ───────────────────────────────────────────────

function obtenerTabId() {
  let id = sessionStorage.getItem('rdcft_tab_id');
  if (!id) { id = Math.random().toString(36).slice(2); sessionStorage.setItem('rdcft_tab_id', id); }
  return id;
}

function haySessionDuplicada(email) {
  try {
    const lock = JSON.parse(localStorage.getItem(LOCK_KEY));
    if (!lock || lock.email !== email) return false;
    return lock.tabId !== obtenerTabId();
  } catch { return false; }
}

function registrarSession(email) {
  localStorage.setItem(LOCK_KEY, JSON.stringify({ email, tabId: obtenerTabId() }));
}

function liberarSession(email) {
  try {
    const lock = JSON.parse(localStorage.getItem(LOCK_KEY));
    if (lock?.email === email && lock?.tabId === obtenerTabId()) localStorage.removeItem(LOCK_KEY);
  } catch {}
}

function forzarLogin() {
  localStorage.removeItem(LOCK_KEY);
  _doLogin(true);
}

let usuariosDB          = null;
let sessionPollTimer    = null;
let adminPollTimer      = null;
let _pinUsuarioPendiente = null;

// BroadcastChannel: notifica a otras pestañas del mismo navegador cuando hay un nuevo login
const _sessionChannel = typeof BroadcastChannel !== 'undefined'
  ? new BroadcastChannel('rdcft_session')
  : null;

if (_sessionChannel) {
  _sessionChannel.onmessage = (ev) => {
    if (ev.data?.type !== 'new_login') return;
    const sesion = verificarSesion();
    if (!sesion || sesion.email !== ev.data.email) return;
    // Otra pestaña del mismo navegador hizo login con este mismo correo
    _cerrarSesionForzada();
  };
}

function iniciarPollSesion() {
  detenerPollSesion();
  // Primer chequeo inmediato (no esperar 30s)
  validarSesionRemota();
  sessionPollTimer = setInterval(validarSesionRemota, 15000);
}

function detenerPollSesion() {
  if (sessionPollTimer) { clearInterval(sessionPollTimer); sessionPollTimer = null; }
}

function mostrarBadgeAdmin(n) {
  const badge = document.getElementById('adminBadge');
  if (!badge) return;
  if (n > 0) {
    badge.textContent  = n;
    badge.style.display = 'inline-flex';
  } else {
    badge.style.display = 'none';
  }
}

async function checkPendientes() {
  if (ES_LOCAL) return;
  const sesion = verificarSesion();
  if (!sesion || sesion.rol !== 'admin') return;
  try {
    const resp = await fetch('/api/token?type=pendientes', {
      headers: { Authorization: `Bearer ${crearCredenciales(sesion)}` },
      signal: AbortSignal.timeout(8000)
    });
    if (resp.ok) {
      const data = await resp.json();
      mostrarBadgeAdmin(data.pendientes || 0);
    }
  } catch {}
}

function iniciarPollAdmin() {
  if (adminPollTimer) return;
  checkPendientes();
  adminPollTimer = setInterval(checkPendientes, 60000);
}

function detenerPollAdmin() {
  if (adminPollTimer) { clearInterval(adminPollTimer); adminPollTimer = null; }
}

function _cerrarSesionForzada() {
  detenerPollSesion();
  const sesion = verificarSesion();          // leer ANTES de borrar
  if (sesion) liberarSession(sesion.email);
  sessionStorage.removeItem(SESSION_KEY);
  usuariosDB = null;
  mostrarLogin();
  const errorMsg = document.getElementById('loginError');
  if (errorMsg) {
    errorMsg.textContent = 'Tu sesión fue cerrada porque se inició sesión desde otro dispositivo.';
    errorMsg.style.display = 'block';
  }
}

async function validarSesionRemota() {
  if (ES_LOCAL) return;
  const sesion = verificarSesion();
  if (!sesion?.sessionId) return;
  try {
    const resp = await fetch('/api/ping-sesion', {
      headers: { 'Authorization': `Bearer ${crearCredenciales(sesion)}` },
      signal: AbortSignal.timeout(8000)
    });
    if (resp.status === 401) _cerrarSesionForzada();
  } catch {}
}

// ── Utilidades ────────────────────────────────────────────────────────────────

function formatLastLogin(iso) {
  if (!iso) return '<span style="color:var(--c-text-dim);font-size:11px;">Nunca</span>';
  const d    = new Date(iso);
  const diff = Date.now() - d;
  if (diff < 60000)     return '<span style="color:var(--c-green);font-size:11px;">Ahora</span>';
  if (diff < 3600000)   return `<span style="font-size:11px;">Hace ${Math.floor(diff/60000)} min</span>`;
  if (diff < 86400000)  return `<span style="font-size:11px;">Hoy ${d.toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'})}</span>`;
  if (diff < 172800000) return `<span style="font-size:11px;">Ayer ${d.toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'})}</span>`;
  return `<span style="font-size:11px;">${d.toLocaleDateString('es-CL',{day:'2-digit',month:'2-digit',year:'2-digit'})}</span>`;
}

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Codifica {email, token, sessionId} en base64 para el header Authorization
function crearCredenciales(sesion) {
  return btoa(JSON.stringify({ email: sesion.email, token: sesion.token, sessionId: sesion.sessionId }));
}

// ── Carga de usuarios ─────────────────────────────────────────────────────────

// Solo en modo local (en producción la verificación ocurre en el servidor)
async function cargarUsuarios() {
  if (!ES_LOCAL) return;
  try {
    const resp = await fetch('data/usuarios.json');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    usuariosDB = data.usuarios || [];
  } catch (err) {
    console.warn('[RDCFT] Error cargando usuarios:', err);
    usuariosDB = [];
  }
}

// Carga usuarios completos para el panel admin (solo producción, requiere auth)
async function cargarUsuariosConAuth() {
  try {
    const sesion = verificarSesion();
    if (!sesion?.token) throw new Error('Sin sesión válida');
    const resp = await fetch('/api/token?type=usuarios', {
      headers: { 'Authorization': `Bearer ${crearCredenciales(sesion)}` }
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    usuariosDB = data.usuarios || [];
  } catch (err) {
    console.warn('[RDCFT] Error cargando usuarios (admin):', err);
    usuariosDB = [];
  }
}

// ── Sesión ────────────────────────────────────────────────────────────────────

function verificarSesion() {
  try {
    const u = sessionStorage.getItem(SESSION_KEY);
    return u ? JSON.parse(u) : null;
  } catch { return null; }
}

function mostrarLogin() {
  detenerPollSesion();
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('appShell').style.display   = 'none';
  setTimeout(() => { const i = document.getElementById('inputEmail'); if (i) i.focus(); }, 100);
}

function mostrarDashboard(usuario) {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('appShell').style.display   = 'flex';
  setTimeout(() => { if (typeof precargarPredios === 'function') precargarPredios(); }, 2000);

  iniciarPollSesion();
  const badge = document.getElementById('userBadge');
  if (badge) {
    badge.innerHTML = `
      <span class="user-email">${escapeHtml(usuario.email)}</span>
      <span class="user-meta">
        <span class="user-cargo">${escapeHtml(usuario.cargo || '')}</span>
        <span class="user-rol rol-${escapeHtml(usuario.rol)}">${usuario.rol === 'admin' ? '⭐ Admin' : '👤 Usuario'}</span>
      </span>
    `;
  }

  const btnAdmin = document.getElementById('btnAdmin');
  if (btnAdmin) btnAdmin.style.display = usuario.rol === 'admin' ? 'inline-flex' : 'none';
  if (usuario.rol === 'admin') iniciarPollAdmin();
}

// ── Login ─────────────────────────────────────────────────────────────────────

function verificarCorreo() { _doLogin(false); }

async function _doLogin(force) {
  const input    = document.getElementById('inputEmail');
  const errorMsg = document.getElementById('loginError');
  const btn      = document.getElementById('btnAcceder');
  const email    = (input.value || '').trim().toLowerCase();
  errorMsg.style.display = 'none';

  if (!email.includes('@')) {
    errorMsg.textContent = 'Ingresa un correo electrónico válido.';
    errorMsg.style.display = 'block'; return;
  }
  if (!email.endsWith('@arauco.com')) {
    errorMsg.textContent = 'Acceso restringido. Solo se permiten correos @arauco.com.';
    errorMsg.style.display = 'block'; return;
  }

  // Verificación rápida en el mismo navegador (sin hit al servidor)
  if (!force && haySessionDuplicada(email)) {
    _mostrarErrorConFuerza('Ya existe una sesión activa con este correo en este navegador.');
    return;
  }

  btn.textContent = '⏳ Verificando...'; btn.disabled = true;
  _ocultarSolicitud();

  try {
    let usuario;

    if (ES_LOCAL) {
      if (!usuariosDB) await cargarUsuarios();
      usuario = usuariosDB.find(u => u.email === email);
      if (!usuario) {
        _mostrarErrorConSolicitud(email);
        return;
      }
    } else {
      const resp = await fetch('/api/verificar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, force: force || false })
      });
      if (resp.status === 409) {
        _mostrarErrorConFuerza('Ya existe una sesión activa con este correo en otro dispositivo.');
        return;
      }
      if (resp.status === 403) {
        _mostrarErrorConSolicitud(email);
        return;
      }
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || `Error del servidor (${resp.status})`);
      }
      usuario = await resp.json();
    }

    if (usuario.rol === 'admin') {
      // Los admins pasan por verificación de PIN antes de acceder
      await mostrarPantallaPIN(usuario);
    } else {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(usuario));
      registrarSession(usuario.email);
      _sessionChannel?.postMessage({ type: 'new_login', email: usuario.email });
      mostrarDashboard(usuario);
    }
  } catch (err) {
    errorMsg.textContent = err.message;
    errorMsg.style.display = 'block';
  } finally {
    btn.textContent = 'Acceder →'; btn.disabled = false;
  }
}

function _mostrarErrorConFuerza(mensaje) {
  const errorMsg = document.getElementById('loginError');
  errorMsg.innerHTML = escapeHtml(mensaje) + ' ' +
    '<a href="#" onclick="forzarLogin();return false;" style="color:var(--c-orange);text-decoration:underline;">Cerrar la otra sesión e ingresar</a>';
  errorMsg.style.display = 'block';
}

function cerrarSesion() {
  detenerPollSesion();
  detenerPollAdmin();
  const sesion = verificarSesion();
  if (sesion && !ES_LOCAL) {
    fetch('/api/logout', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${crearCredenciales(sesion)}` }
    }).catch(() => {});
  }
  if (sesion) liberarSession(sesion.email);
  sessionStorage.removeItem(SESSION_KEY);
  usuariosDB = null;
  mostrarLogin();
}

function handleKeyDown(e) { if (e.key === 'Enter') verificarCorreo(); }
function handlePinKeyDown(e) { if (e.key === 'Enter') verificarPIN(); }

// ── PIN de seguridad (solo admins) ────────────────────────────────────────────

async function _hashPinLocal(pin, email) {
  const encoder = new TextEncoder();
  const keyData = encoder.encode('rdcft-admin-pin-local');
  const msgData = encoder.encode(`${pin}:${email}`);
  const key = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig  = await crypto.subtle.sign('HMAC', key, msgData);
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function mostrarPantallaPIN(usuario) {
  _pinUsuarioPendiente = usuario;

  const pinScreen       = document.getElementById('pinScreen');
  const pinTitle        = document.getElementById('pinTitle');
  const pinSubtitle     = document.getElementById('pinSubtitle');
  const pinEmailDisplay = document.getElementById('pinEmailDisplay');
  const pinError        = document.getElementById('pinError');
  const pinInput        = document.getElementById('inputPin');
  const pinConfirmGroup = document.getElementById('pinConfirmGroup');
  const pinConfirmInput = document.getElementById('inputPinConfirm');
  const modeInput       = document.getElementById('pinScreenMode');

  document.getElementById('loginScreen').style.display = 'none';
  pinScreen.style.display = 'flex';
  pinError.style.display  = 'none';
  pinInput.value = '';
  if (pinConfirmInput) pinConfirmInput.value = '';
  if (pinEmailDisplay) pinEmailDisplay.textContent = usuario.email;

  let hasPin = false;
  if (ES_LOCAL) {
    hasPin = !!localStorage.getItem(`admin-pin:${usuario.email}`);
  } else {
    try {
      const resp = await fetch('/api/admin-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${crearCredenciales(usuario)}` },
        body: JSON.stringify({ action: 'check' })
      });
      if (resp.ok) { const d = await resp.json(); hasPin = d.hasPin || false; }
    } catch {}
  }

  if (hasPin) {
    pinTitle.textContent    = 'Verificacion de administrador';
    pinSubtitle.textContent = 'Ingresa tu PIN de seguridad para continuar.';
    if (pinConfirmGroup) pinConfirmGroup.style.display = 'none';
    if (modeInput) modeInput.value = 'verify';
  } else {
    pinTitle.textContent    = 'Crear PIN de seguridad';
    pinSubtitle.textContent = 'Como administrador debes crear un PIN personal. Lo necesitaras cada vez que inicies sesion.';
    if (pinConfirmGroup) pinConfirmGroup.style.display = 'block';
    if (modeInput) modeInput.value = 'create';
  }

  setTimeout(() => pinInput.focus(), 100);
}

async function verificarPIN() {
  const pin     = (document.getElementById('inputPin')?.value || '');
  const mode    = document.getElementById('pinScreenMode')?.value;
  const errorEl = document.getElementById('pinError');
  const btn     = document.getElementById('btnPIN');
  if (errorEl) errorEl.style.display = 'none';

  if (!pin || pin.length < 4) {
    if (errorEl) { errorEl.textContent = 'El PIN debe tener al menos 4 caracteres.'; errorEl.style.display = 'block'; }
    return;
  }

  if (btn) { btn.textContent = 'Verificando...'; btn.disabled = true; }

  try {
    if (mode === 'create') {
      const pinConfirm = (document.getElementById('inputPinConfirm')?.value || '');
      if (pin !== pinConfirm) {
        if (errorEl) { errorEl.textContent = 'Los PINs no coinciden.'; errorEl.style.display = 'block'; }
        return;
      }
      // Guardar PIN
      if (ES_LOCAL) {
        const hash = await _hashPinLocal(pin, _pinUsuarioPendiente.email);
        localStorage.setItem(`admin-pin:${_pinUsuarioPendiente.email}`, hash);
      } else {
        const resp = await fetch('/api/admin-pin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${crearCredenciales(_pinUsuarioPendiente)}` },
          body: JSON.stringify({ action: 'set', pin })
        });
        if (!resp.ok) { const e = await resp.json().catch(() => ({})); throw new Error(e.error || `Error ${resp.status}`); }
      }
    } else {
      // Verificar PIN
      let ok = false;
      if (ES_LOCAL) {
        const stored = localStorage.getItem(`admin-pin:${_pinUsuarioPendiente.email}`);
        if (!stored) throw new Error('PIN no configurado. Recarga la pagina.');
        const hash = await _hashPinLocal(pin, _pinUsuarioPendiente.email);
        ok = (hash === stored);
      } else {
        const resp = await fetch('/api/admin-pin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${crearCredenciales(_pinUsuarioPendiente)}` },
          body: JSON.stringify({ action: 'verify', pin })
        });
        if (resp.status === 401) { ok = false; }
        else if (!resp.ok) { const e = await resp.json().catch(() => ({})); throw new Error(e.error || `Error ${resp.status}`); }
        else { ok = true; }
      }
      if (!ok) {
        if (errorEl) { errorEl.textContent = 'PIN incorrecto. Intenta nuevamente.'; errorEl.style.display = 'block'; }
        const pinInput = document.getElementById('inputPin');
        if (pinInput) { pinInput.value = ''; pinInput.focus(); }
        return;
      }
    }

    // Exito: completar login
    document.getElementById('pinScreen').style.display = 'none';
    const usuario = _pinUsuarioPendiente;
    _pinUsuarioPendiente = null;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(usuario));
    registrarSession(usuario.email);
    _sessionChannel?.postMessage({ type: 'new_login', email: usuario.email });
    mostrarDashboard(usuario);
  } catch (err) {
    if (errorEl) { errorEl.textContent = err.message; errorEl.style.display = 'block'; }
  } finally {
    if (btn) { btn.textContent = 'Continuar →'; btn.disabled = false; }
  }
}

function cancelarPIN() {
  _pinUsuarioPendiente = null;
  document.getElementById('pinScreen').style.display = 'none';
  mostrarLogin();
}

// ── Solicitud de acceso ───────────────────────────────────────────────────────

function _mostrarErrorConSolicitud(email) {
  const errorMsg = document.getElementById('loginError');
  errorMsg.textContent = 'Correo no registrado. Contacta al administrador o solicita acceso.';
  errorMsg.style.display = 'block';

  const panel   = document.getElementById('solicitudPanel');
  const preview = document.getElementById('solicitudEmailPreview');
  const msg     = document.getElementById('solicitudMsg');
  if (preview) preview.textContent = email;
  if (msg) msg.style.display = 'none';
  if (panel) panel.style.display = 'flex';

  const btn = document.getElementById('btnAcceder');
  if (btn) { btn.textContent = 'Acceder →'; btn.disabled = false; }
}

function toggleSolicitud() {
  const panel = document.getElementById('solicitudPanel');
  const email = (document.getElementById('inputEmail')?.value || '').trim().toLowerCase();
  if (!panel) return;
  const abriendo = panel.style.display === 'none';
  panel.style.display = abriendo ? 'flex' : 'none';
  if (abriendo) {
    const preview = document.getElementById('solicitudEmailPreview');
    if (preview) preview.textContent = email || '(ingresa tu correo arriba)';
    document.getElementById('solicitudNombre')?.focus();
  }
}

function _ocultarSolicitud() {
  const panel = document.getElementById('solicitudPanel');
  if (panel) panel.style.display = 'none';
  const n = document.getElementById('solicitudNombre');
  const c = document.getElementById('solicitudCargo');
  if (n) n.value = '';
  if (c) c.value = '';
}

async function enviarSolicitud() {
  const nombre  = (document.getElementById('solicitudNombre')?.value || '').trim();
  const cargo   = (document.getElementById('solicitudCargo')?.value  || '').trim();
  const email   = (document.getElementById('solicitudEmailPreview')?.textContent || '').trim();
  const btn     = document.getElementById('btnSolicitud');
  const msg     = document.getElementById('solicitudMsg');

  if (!nombre || !cargo) {
    msg.textContent = 'Completa nombre y cargo.';
    msg.className = 'solicitud-msg error';
    msg.style.display = 'block';
    return;
  }

  btn.textContent = '⏳ Enviando...'; btn.disabled = true;
  msg.style.display = 'none';

  try {
    if (ES_LOCAL) {
      msg.textContent = '✅ Solicitud enviada. El administrador te habilitará el acceso.';
      msg.className = 'solicitud-msg ok';
      msg.style.display = 'block';
      return;
    }

    const resp = await fetch('/api/solicitar-acceso', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, cargo, email })
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error || `Error ${resp.status}`);

    msg.textContent = '✅ Solicitud enviada. El administrador te habilitará el acceso.';
    msg.className = 'solicitud-msg ok';
    msg.style.display = 'block';
    btn.style.display = 'none';
  } catch (err) {
    msg.textContent = '❌ ' + err.message;
    msg.className = 'solicitud-msg error';
    msg.style.display = 'block';
  } finally {
    if (btn) { btn.textContent = 'Enviar solicitud →'; btn.disabled = false; }
  }
}

// ── Panel Admin ───────────────────────────────────────────────────────────────

function abrirAdmin() {
  const u = verificarSesion();
  if (!u || u.rol !== 'admin') return;
  mostrarBadgeAdmin(0);
  window.location.href = '/admin.html';
}

function cerrarAdmin() {
  document.getElementById('adminPanel').style.display = 'none';
}

let filtroBusqueda = '';

function cargarTablaUsuarios() {
  if (!usuariosDB) return;
  const tbody   = document.getElementById('adminTablaBody');
  const usuario = verificarSesion();
  const counter = document.getElementById('adminCounter');

  const filtrados = usuariosDB.filter(u =>
    u.email.toLowerCase().includes(filtroBusqueda) ||
    (u.cargo || '').toLowerCase().includes(filtroBusqueda)
  );

  if (counter) counter.textContent = `${filtrados.length} de ${usuariosDB.length} usuarios`;

  tbody.innerHTML = filtrados.length === 0
    ? `<tr><td colspan="4" style="text-align:center;color:var(--c-text-dim);padding:20px;">No se encontraron usuarios</td></tr>`
    : filtrados.map(u => {
        const idxReal = usuariosDB.indexOf(u);
        const esSelf  = u.email === usuario.email;
        const esAdmin = u.rol === 'admin';
        return `
          <tr>
            <td>${escapeHtml(u.email)}</td>
            <td><span class="rol-badge rol-${escapeHtml(u.rol)}">${esAdmin ? '⭐ Admin' : '👤 Usuario'}</span></td>
            <td>${escapeHtml(u.cargo || '-')}</td>
            <td>${formatLastLogin(u.lastlogin)}</td>
            <td class="admin-acciones">
              ${!esSelf ? `
                <button class="admin-rol-btn ${esAdmin ? 'admin-rol-quitar' : 'admin-rol-dar'}"
                  onclick="cambiarRol(${idxReal})"
                  title="${esAdmin ? 'Quitar admin' : 'Dar admin'}">
                  ${esAdmin ? '⬇ Usuario' : '⬆ Admin'}
                </button>
                <button class="admin-del-btn" onclick="eliminarUsuario(${idxReal})" title="Eliminar">✕</button>
              ` : '<span style="color:var(--c-text-dim);font-size:11px;">Tú</span>'}
            </td>
          </tr>
        `;
      }).join('');
}

function buscarUsuario(valor) {
  filtroBusqueda = valor.toLowerCase();
  cargarTablaUsuarios();
}

async function cambiarRol(idx) {
  const u      = usuariosDB[idx];
  const nuevoRol = u.rol === 'admin' ? 'usuario' : 'admin';

  if (nuevoRol === 'admin' && usuariosDB.filter(u => u.rol === 'admin').length >= 5) {
    alert('Máximo 5 administradores permitidos');
    return;
  }

  usuariosDB[idx].rol = nuevoRol;
  cargarTablaUsuarios();
  await guardarUsuarios();
}

async function agregarUsuario() {
  const emailInput = document.getElementById('adminNuevoEmail');
  const rolInput   = document.getElementById('adminNuevoRol');
  const cargoInput = document.getElementById('adminNuevoCargo');
  const errorDiv   = document.getElementById('adminError');
  const email      = (emailInput.value || '').trim().toLowerCase();
  const rol        = rolInput.value;
  const cargo      = cargoInput.value.trim();
  errorDiv.style.display = 'none';

  if (!email.endsWith('@arauco.com')) {
    errorDiv.textContent = 'Solo se permiten correos @arauco.com';
    errorDiv.style.display = 'block'; return;
  }
  if (usuariosDB.find(u => u.email === email)) {
    errorDiv.textContent = 'Este correo ya está registrado';
    errorDiv.style.display = 'block'; return;
  }
  if (rol === 'admin' && usuariosDB.filter(u => u.rol === 'admin').length >= 5) {
    errorDiv.textContent = 'Máximo 5 administradores permitidos';
    errorDiv.style.display = 'block'; return;
  }

  usuariosDB.push({ email, rol, cargo });
  emailInput.value = ''; cargoInput.value = '';
  cargarTablaUsuarios();
  await guardarUsuarios();
}

async function eliminarUsuario(idx) {
  const aEliminar = usuariosDB[idx];
  if (!confirm(`¿Eliminar a ${aEliminar.email}?`)) return;
  usuariosDB.splice(idx, 1);
  cargarTablaUsuarios();
  await guardarUsuarios();
}

async function guardarUsuarios() {
  const btn = document.getElementById('btnGuardarUsuarios');
  if (btn) { btn.textContent = '⏳ Guardando...'; btn.disabled = true; }

  try {
    if (ES_LOCAL) {
      mostrarMensajeAdmin('✅ Cambios aplicados localmente. En producción usa la URL de Vercel.', 'success');
      if (btn) { btn.textContent = '💾 Guardar cambios'; btn.disabled = false; }
      return;
    }

    const sesion = verificarSesion();
    if (!sesion?.token) throw new Error('Sesión inválida. Vuelve a iniciar sesión.');

    const resp = await fetch('/api/usuarios', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${crearCredenciales(sesion)}`
      },
      body: JSON.stringify({ usuarios: usuariosDB })
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || `Error: ${resp.status}`);
    }
    mostrarMensajeAdmin('✅ Usuarios actualizados correctamente.', 'success');
  } catch (err) {
    mostrarMensajeAdmin('❌ Error al guardar: ' + err.message, 'error');
  } finally {
    if (btn) { btn.textContent = '💾 Guardar cambios'; btn.disabled = false; }
  }
}

function exportarCSV() {
  if (!usuariosDB || usuariosDB.length === 0) {
    mostrarMensajeAdmin('No hay usuarios para exportar.', 'error');
    return;
  }
  const header = ['Correo', 'Rol', 'Cargo'];
  const rows = usuariosDB.map(u => [
    u.email,
    u.rol,
    u.cargo || ''
  ]);
  const csv = [header, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
    .join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `usuarios_rdcft_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function mostrarMensajeAdmin(msg, tipo) {
  const div = document.getElementById('adminMensaje');
  if (!div) return;
  div.textContent = msg; div.className = `admin-mensaje admin-mensaje-${tipo}`;
  div.style.display = 'block';
  if (tipo !== 'error') setTimeout(() => div.style.display = 'none', 6000);
}

// ── Panel Sugerencias ─────────────────────────────────────────────────────────

function abrirFeedback() {
  document.getElementById('feedbackOverlay').style.display = 'block';
  document.getElementById('feedbackModal').style.display = 'flex';
  setTimeout(() => document.getElementById('feedbackMensaje').focus(), 80);
}

function cerrarFeedback() {
  document.getElementById('feedbackOverlay').style.display = 'none';
  document.getElementById('feedbackModal').style.display = 'none';
  document.getElementById('feedbackMensaje').value = '';
  document.getElementById('feedbackError').style.display = 'none';
  document.getElementById('feedbackOk').style.display = 'none';
  const btn = document.getElementById('btnFeedback');
  if (btn) { btn.textContent = 'Enviar →'; btn.disabled = false; btn.style.display = ''; }
  const radios = document.querySelectorAll('input[name="feedbackTipo"]');
  if (radios[0]) radios[0].checked = true;
}

async function enviarFeedback() {
  const mensaje  = (document.getElementById('feedbackMensaje').value || '').trim();
  const tipo     = document.querySelector('input[name="feedbackTipo"]:checked')?.value || 'consulta';
  const errorDiv = document.getElementById('feedbackError');
  const okDiv    = document.getElementById('feedbackOk');
  const btn      = document.getElementById('btnFeedback');

  errorDiv.style.display = 'none';
  okDiv.style.display    = 'none';

  if (mensaje.length < 10) {
    errorDiv.textContent = 'El mensaje debe tener al menos 10 caracteres.';
    errorDiv.style.display = 'block';
    return;
  }

  btn.textContent = '⏳ Enviando...'; btn.disabled = true;

  try {
    const sesion  = verificarSesion();
    const apiBase = ES_LOCAL ? 'https://arauco-rdcft.vercel.app' : '';
    const resp = await fetch(`${apiBase}/api/feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(sesion ? { 'Authorization': `Bearer ${crearCredenciales(sesion)}` } : {})
      },
      body: JSON.stringify({ tipo, mensaje, email: sesion?.email || '' })
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || `Error ${resp.status}`);
    }

    okDiv.style.display = 'block';
    btn.style.display   = 'none';
    setTimeout(cerrarFeedback, 2500);
  } catch (err) {
    errorDiv.textContent = '❌ ' + err.message;
    errorDiv.style.display = 'block';
    btn.textContent = 'Enviar →'; btn.disabled = false;
  }
}

// ── Inicialización ────────────────────────────────────────────────────────────

// Chequeo inmediato al volver a la pestaña o ventana (sin esperar el siguiente ciclo del poll)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') validarSesionRemota();
});
window.addEventListener('focus', validarSesionRemota);

window.addEventListener('DOMContentLoaded', async () => {
  if (ES_LOCAL) await cargarUsuarios();
  const sesion = verificarSesion();
  if (sesion) {
    registrarSession(sesion.email); // re-registrar al recargar la misma pestaña
    mostrarDashboard(sesion);
  } else {
    mostrarLogin();
  }
});
