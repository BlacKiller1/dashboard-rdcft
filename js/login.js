/* ═══════════════════════════════════════════════════════════════════════
   login.js
   Autenticación Google OAuth — Solo @arauco.com
   Dashboard Meteorológico RDCFT — Arauco
   ═══════════════════════════════════════════════════════════════════════ */

const GOOGLE_CLIENT_ID = '391385376106-3rfkfmv6fuglpboq0jre2jrugj989hpv.apps.googleusercontent.com';
const DOMINIO_PERMITIDO = 'arauco.com';
const SESSION_KEY = 'rdcft_user';

/* ── Verificar si ya hay sesión activa ─────────────────────────────── */
function verificarSesion() {
  const usuario = sessionStorage.getItem(SESSION_KEY);
  if (usuario) {
    const datos = JSON.parse(usuario);
    // Verificar que el token no haya expirado
    if (datos.exp && Date.now() < datos.exp * 1000) {
      return datos;
    }
    sessionStorage.removeItem(SESSION_KEY);
  }
  return null;
}

/* ── Mostrar pantalla de login ─────────────────────────────────────── */
function mostrarLogin() {
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('appShell').style.display = 'none';
}

/* ── Mostrar el dashboard ──────────────────────────────────────────── */
function mostrarDashboard(usuario) {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('appShell').style.display = 'flex';

  // Mostrar nombre en topbar
  const badge = document.getElementById('userBadge');
  if (badge) {
    badge.textContent = usuario.nombre;
    badge.title = usuario.email;
  }
}

/* ── Callback de Google Identity Services ──────────────────────────── */
function handleCredentialResponse(response) {
  const btnLogin = document.getElementById('btnLogin');
  const errorMsg = document.getElementById('loginError');

  try {
    // Decodificar JWT de Google (sin verificación de firma — solo para leer claims)
    const payload = JSON.parse(atob(response.credential.split('.')[1]));

    const email = payload.email || '';
    const dominio = email.split('@')[1] || '';

    if (dominio !== DOMINIO_PERMITIDO) {
      // Acceso denegado
      errorMsg.textContent = `Acceso restringido. Solo se permiten correos @${DOMINIO_PERMITIDO}. Tu correo (${email}) no está autorizado.`;
      errorMsg.style.display = 'block';
      btnLogin.disabled = false;
      return;
    }

    // Guardar sesión
    const usuario = {
      nombre: payload.name,
      email:  payload.email,
      foto:   payload.picture,
      exp:    payload.exp
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(usuario));

    // Ocultar error si había
    errorMsg.style.display = 'none';

    // Mostrar dashboard
    mostrarDashboard(usuario);

  } catch (err) {
    errorMsg.textContent = 'Error al verificar credenciales. Intenta nuevamente.';
    errorMsg.style.display = 'block';
    console.error('Auth error:', err);
  }
}

/* ── Cerrar sesión ─────────────────────────────────────────────────── */
function cerrarSesion() {
  sessionStorage.removeItem(SESSION_KEY);
  google.accounts.id.disableAutoSelect();
  mostrarLogin();
}

/* ── Inicializar al cargar la página ───────────────────────────────── */
window.addEventListener('DOMContentLoaded', () => {
  // Inicializar Google Identity Services
  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback:  handleCredentialResponse,
    auto_select: false
  });

  // Verificar sesión existente
  const sesionActiva = verificarSesion();
  if (sesionActiva) {
    mostrarDashboard(sesionActiva);
    return;
  }

  // Mostrar pantalla de login
  mostrarLogin();

  // Renderizar botón de Google
  google.accounts.id.renderButton(
    document.getElementById('googleBtn'),
    {
      theme: 'filled_black',
      size:  'large',
      text:  'signin_with',
      shape: 'rectangular',
      width: 280,
      locale: 'es'
    }
  );
});
