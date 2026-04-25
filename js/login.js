/* ═══════════════════════════════════════════════════════════════════════
   login.js — Autenticación con base de datos de usuarios y roles
   Dashboard Meteorológico RDCFT — Arauco
   ═══════════════════════════════════════════════════════════════════════ */

const SESSION_KEY  = 'rdcft_user';
// En localhost usar archivo local, en produccion usar API segura
const ES_LOCAL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const USUARIOS_URL = ES_LOCAL ? '/data/usuarios.json' : '/api/token?type=usuarios';
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
  if (badge) { badge.textContent = usuario.email; badge.title = `Rol: ${usuario.rol}`; }
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

function cargarTablaUsuarios() {
  if (!usuariosDB) return;
  const tbody = document.getElementById('adminTablaBody');
  const usuario = verificarSesion();
  tbody.innerHTML = usuariosDB.map((u, i) => `
    <tr>
      <td>${u.email}</td>
      <td><span class="rol-badge rol-${u.rol}">${u.rol === 'admin' ? '⭐ Admin' : '👤 Usuario'}</span></td>
      <td>${u.cargo || '-'}</td>
      <td>${u.email !== usuario.email ? `<button class="admin-del-btn" onclick="eliminarUsuario(${i})">✕</button>` : '-'}</td>
    </tr>
  `).join('');
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