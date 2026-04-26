/* ═══════════════════════════════════════════════════════════════════════
   login.js — Autenticación con base de datos de usuarios y roles
   Dashboard Meteorológico RDCFT — Arauco
   ═══════════════════════════════════════════════════════════════════════ */

const SESSION_KEY  = 'rdcft_user';
// En localhost usar archivo local, en produccion usar API segura
const ES_LOCAL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:';
const USUARIOS_URL = ES_LOCAL ? 'data/usuarios.json' : '/api/token?type=usuarios';
let usuariosDB     = null;

async function cargarUsuarios() {
  try {
    const resp = await fetch(USUARIOS_URL);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    usuariosDB = data.usuarios || [];
  } catch (err) {
    console.warn('[RDCFT] Error cargando usuarios:', err);
    usuariosDB = [];
  }
}

function verificarSesion() {
  const u = sessionStorage.getItem(SESSION_KEY);
  return u ? JSON.parse(u) : null;
}

function mostrarLogin() {
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('appShell').style.display   = 'none';
  setTimeout(() => { const i = document.getElementById('inputEmail'); if (i) i.focus(); }, 100);
}

function mostrarDashboard(usuario) {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('appShell').style.display   = 'flex';

  const badge = document.getElementById('userBadge');
  if (badge) {
    badge.innerHTML = `
      <span class="user-email">${usuario.email}</span>
      <span class="user-meta">
        <span class="user-cargo">${usuario.cargo || ''}</span>
        <span class="user-rol rol-${usuario.rol}">${usuario.rol === 'admin' ? '⭐ Admin' : '👤 Usuario'}</span>
      </span>
    `;
  }

  const btnAdmin = document.getElementById('btnAdmin');
  if (btnAdmin) btnAdmin.style.display = usuario.rol === 'admin' ? 'inline-flex' : 'none';
}

async function verificarCorreo() {
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

  btn.textContent = '⏳ Verificando...'; btn.disabled = true;
  if (!usuariosDB) await cargarUsuarios();

  const encontrado = usuariosDB.find(u => u.email === email);
  btn.textContent = 'Acceder →'; btn.disabled = false;

  if (!encontrado) {
    errorMsg.textContent = `El correo ${email} no está registrado. Contacta al administrador.`;
    errorMsg.style.display = 'block'; return;
  }

  sessionStorage.setItem(SESSION_KEY, JSON.stringify(encontrado));
  mostrarDashboard(encontrado);
}

function cerrarSesion() {
  sessionStorage.removeItem(SESSION_KEY);
  mostrarLogin();
}

function handleKeyDown(e) { if (e.key === 'Enter') verificarCorreo(); }

/* ── Panel Admin ── */
function abrirAdmin() {
  const u = verificarSesion();
  if (!u || u.rol !== 'admin') return;
  document.getElementById('adminPanel').style.display = 'flex';
  cargarTablaUsuarios();
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
    : filtrados.map((u, i) => {
        const idxReal = usuariosDB.indexOf(u);
        const esSelf  = u.email === usuario.email;
        const esAdmin = u.rol === 'admin';
        return `
          <tr>
            <td>${u.email}</td>
            <td><span class="rol-badge rol-${u.rol}">${esAdmin ? '⭐ Admin' : '👤 Usuario'}</span></td>
            <td>${u.cargo || '-'}</td>
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

function cambiarRol(idx) {
  const u = usuariosDB[idx];
  const nuevoRol = u.rol === 'admin' ? 'usuario' : 'admin';

  // Verificar límite de admins
  if (nuevoRol === 'admin' && usuariosDB.filter(u => u.rol === 'admin').length >= 5) {
    alert('Máximo 5 administradores permitidos');
    return;
  }

  usuariosDB[idx].rol = nuevoRol;
  cargarTablaUsuarios();
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
    // En localhost no llamar al API de Vercel
    if (ES_LOCAL) {
      mostrarMensajeAdmin('✅ Cambios aplicados localmente. En producción usa la URL de Vercel.', 'success');
      if (btn) { btn.textContent = '💾 Guardar cambios'; btn.disabled = false; }
      return;
    }

    const resp = await fetch('/api/usuarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuarios: usuariosDB })
    });
    if (!resp.ok) throw new Error(`Error: ${resp.status}`);
    mostrarMensajeAdmin('✅ Usuarios guardados. El sistema se actualizará en ~1 minuto.', 'success');
  } catch (err) {
    mostrarMensajeAdmin('❌ Error al guardar: ' + err.message, 'error');
  } finally {
    if (btn) { btn.textContent = '💾 Guardar cambios'; btn.disabled = false; }
  }
}

function mostrarMensajeAdmin(msg, tipo) {
  const div = document.getElementById('adminMensaje');
  if (!div) return;
  div.textContent = msg; div.className = `admin-mensaje admin-mensaje-${tipo}`;
  div.style.display = 'block';
  setTimeout(() => div.style.display = 'none', 4000);
}

window.addEventListener('DOMContentLoaded', async () => {
  await cargarUsuarios();
  const sesion = verificarSesion();
  sesion ? mostrarDashboard(sesion) : mostrarLogin();
});