/* ═══════════════════════════════════════════════════════════════════════
   login.js
   Verificación de correo @arauco.com — Sin contraseña
   Dashboard Meteorológico RDCFT — Arauco
   ═══════════════════════════════════════════════════════════════════════ */

const DOMINIO_PERMITIDO = 'arauco.com';
const SESSION_KEY = 'rdcft_user';

/* ── Verificar sesión activa ───────────────────────────────────────── */
function verificarSesion() {
  const usuario = sessionStorage.getItem(SESSION_KEY);
  if (usuario) return JSON.parse(usuario);
  return null;
}

/* ── Mostrar login ─────────────────────────────────────────────────── */
function mostrarLogin() {
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('appShell').style.display = 'none';
  // Enfocar input automáticamente
  setTimeout(() => {
    const input = document.getElementById('inputEmail');
    if (input) input.focus();
  }, 100);
}

/* ── Mostrar dashboard ─────────────────────────────────────────────── */
function mostrarDashboard(usuario) {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('appShell').style.display = 'flex';

  const badge = document.getElementById('userBadge');
  if (badge) badge.textContent = usuario.email;
}

/* ── Verificar correo ──────────────────────────────────────────────── */
function verificarCorreo() {
  const input    = document.getElementById('inputEmail');
  const errorMsg = document.getElementById('loginError');
  const btnAcceder = document.getElementById('btnAcceder');

  const email  = (input.value || '').trim().toLowerCase();
  const dominio = email.split('@')[1] || '';

  // Limpiar error previo
  errorMsg.style.display = 'none';

  // Validar formato básico
  if (!email.includes('@')) {
    errorMsg.textContent = 'Ingresa un correo electrónico válido.';
    errorMsg.style.display = 'block';
    input.focus();
    return;
  }

  // Validar dominio
  if (dominio !== DOMINIO_PERMITIDO) {
    errorMsg.textContent = `Acceso restringido. Solo se permiten correos @${DOMINIO_PERMITIDO}. El correo "${email}" no está autorizado.`;
    errorMsg.style.display = 'block';
    input.focus();
    return;
  }

  // Acceso permitido — guardar sesión
  const usuario = { email };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(usuario));
  mostrarDashboard(usuario);
}

/* ── Cerrar sesión ─────────────────────────────────────────────────── */
function cerrarSesion() {
  sessionStorage.removeItem(SESSION_KEY);
  mostrarLogin();
}

/* ── Permitir Enter en el input ────────────────────────────────────── */
function handleKeyDown(event) {
  if (event.key === 'Enter') verificarCorreo();
}

/* ── Inicializar ───────────────────────────────────────────────────── */
window.addEventListener('DOMContentLoaded', () => {
  const sesionActiva = verificarSesion();
  if (sesionActiva) {
    mostrarDashboard(sesionActiva);
  } else {
    mostrarLogin();
  }
});