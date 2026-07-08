// api/login-pass.js — Autenticación por contraseña + gestión de contraseñas
// (endpoint único para no exceder el límite de funciones serverless del plan).
//
//   POST { email, password, force? }                    → iniciar sesión
//   POST { action:'change', newPassword, currentPassword? }        (con sesión)
//   POST { action:'set',    targetEmail, newPassword }   (admin, con sesión)
//   POST { action:'clear',  targetEmail }                (admin, con sesión)
//   POST { action:'status' }                             (admin, con sesión)
//
// Contraseñas: scrypt + salt por usuario + ADMIN_SECRET de pepper → passhash:<email>
// Primer ingreso (sin códigos ni correo): si el usuario aún no tiene contraseña,
// la que escriba en el login queda registrada como la suya. Luego se valida
// normalmente. El admin puede reasignar contraseñas desde el panel.
import crypto from 'crypto';
import { redis, setCorsHeaders, parseAuth, verificarToken } from './_auth.js';
import { getUsuarios, pushAuditLog } from './_db.js';

const MAX_FAILS = 8;
const FAIL_TTL  = 600;

function hashPassword(password, email) {
  const secret = process.env.ADMIN_SECRET;
  const salt   = crypto.randomBytes(16);
  const derived = crypto.scryptSync(`${password}:${email}:${secret}`, salt, 32);
  return salt.toString('hex') + ':' + derived.toString('hex');
}
function verifyPassword(password, email, stored) {
  const secret = process.env.ADMIN_SECRET;
  const [saltHex, hashHex] = String(stored).split(':');
  if (!saltHex || !hashHex) return false;
  try {
    const derived = crypto.scryptSync(`${password}:${email}:${secret}`, Buffer.from(saltHex, 'hex'), 32);
    return crypto.timingSafeEqual(derived, Buffer.from(hashHex, 'hex'));
  } catch { return false; }
}
// Verifica sesión firmada para las acciones de gestión
async function requireSession(req) {
  const creds = parseAuth(req);
  if (!creds?.email || !creds?.token || !creds?.sessionId) return { error: 'No autorizado', status: 401 };
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return { error: 'Error interno', status: 500 };
  if (!verificarToken(creds.email, creds.token, secret)) return { error: 'Token inválido', status: 401 };
  const stored = await redis(['GET', `session:${creds.email}`]);
  if (!stored || stored !== creds.sessionId) return { error: 'Sesión inválida o expirada.', status: 401 };
  return { creds };
}

export default async function handler(req, res) {
  setCorsHeaders(req, res, 'POST, OPTIONS', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Método no permitido' });

  const secret = process.env.ADMIN_SECRET;
  if (!secret) return res.status(500).json({ error: 'Error de configuración del servidor' });

  const body   = req.body || {};
  const action = body.action || 'login';

  // ───────────────────────── Gestión de contraseñas ─────────────────────────
  if (action !== 'login') {
    const auth = await requireSession(req);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });
    const { creds } = auth;
    const usuarios = await getUsuarios();
    const me = usuarios.find(u => u.email === creds.email);
    if (!me) return res.status(403).json({ error: 'Usuario no válido' });

    if (action === 'change') {
      const newPassword = body.newPassword;
      if (!newPassword || String(newPassword).length < 6) {
        return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
      }
      const stored = await redis(['GET', `passhash:${creds.email}`]);
      if (stored) {
        const cur = body.currentPassword ? String(body.currentPassword) : '';
        if (!cur || !verifyPassword(cur, creds.email, stored)) {
          return res.status(401).json({ error: 'La contraseña actual es incorrecta.' });
        }
      }
      await redis(['SET', `passhash:${creds.email}`, hashPassword(String(newPassword), creds.email)]);
      await pushAuditLog({ admin: creds.email, accion: 'set_password', usuario: creds.email, detalle: stored ? 'Cambió su contraseña' : 'Definió su contraseña' }).catch(() => {});
      return res.status(200).json({ ok: true });
    }

    // Acciones de administrador
    if (me.rol !== 'admin') return res.status(403).json({ error: 'Sin permisos de administrador' });

    if (action === 'status') {
      const keys = usuarios.map(u => `passhash:${u.email}`);
      const vals = keys.length ? await redis(['MGET', ...keys]) : [];
      const status = {};
      usuarios.forEach((u, i) => { status[u.email] = !!(Array.isArray(vals) && vals[i]); });
      return res.status(200).json({ status });
    }

    const tgt = (body.targetEmail || '').trim().toLowerCase();
    if (!tgt || !usuarios.find(u => u.email === tgt)) return res.status(400).json({ error: 'Usuario destino no válido' });

    if (action === 'set') {
      const newPassword = body.newPassword;
      if (!newPassword || String(newPassword).length < 6) {
        return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
      }
      await redis(['SET', `passhash:${tgt}`, hashPassword(String(newPassword), tgt)]);
      await pushAuditLog({ admin: creds.email, accion: 'set_password', usuario: tgt, detalle: 'Contraseña asignada por administrador' }).catch(() => {});
      return res.status(200).json({ ok: true });
    }
    if (action === 'clear') {
      await redis(['DEL', `passhash:${tgt}`]);
      await pushAuditLog({ admin: creds.email, accion: 'clear_password', usuario: tgt, detalle: 'Contraseña eliminada' }).catch(() => {});
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ error: 'Acción no reconocida' });
  }

  // ───────────────────────────── Iniciar sesión ─────────────────────────────
  const email    = (body.email || '').trim().toLowerCase();
  const password = body.password ? String(body.password) : '';
  const force    = !!body.force;

  if (!email.endsWith('@arauco.com')) return res.status(400).json({ error: 'Solo se permiten correos @arauco.com' });
  if (!password)                      return res.status(400).json({ error: 'Ingresa tu contraseña.' });

  const usuarios = await getUsuarios();
  const usuario  = usuarios.find(u => u.email === email);
  if (!usuario) return res.status(403).json({ error: 'Correo no registrado. Contacta al administrador.' });

  const failKey = `passfail:${email}`;
  const fails   = parseInt(await redis(['GET', failKey])) || 0;
  if (fails >= MAX_FAILS) return res.status(429).json({ error: 'Demasiados intentos. Espera unos minutos e intenta de nuevo.' });

  const stored = await redis(['GET', `passhash:${email}`]);

  let ok = false, creando = false;
  if (stored) {
    ok = verifyPassword(password, email, stored);
  } else {
    // Primer ingreso: la contraseña que escriba queda registrada como la suya
    if (password.length < 6) return res.status(400).json({ error: 'Tu primera contraseña debe tener al menos 6 caracteres.' });
    ok = true; creando = true;
  }

  if (!ok) {
    const n = parseInt(await redis(['INCR', failKey])) || 1;
    if (n === 1) await redis(['EXPIRE', failKey, String(FAIL_TTL)]);
    return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
  }
  await redis(['DEL', failKey]);

  if (creando) {
    await redis(['SET', `passhash:${email}`, hashPassword(password, email)]);
    await pushAuditLog({ admin: email, accion: 'set_password', usuario: email, detalle: 'Definió su contraseña en el primer ingreso' }).catch(() => {});
  }

  const existingSession = await redis(['GET', `session:${email}`]);
  if (existingSession && !force) {
    return res.status(409).json({ error: 'Ya existe una sesión activa con este correo en otro dispositivo.', code: 'SESSION_ACTIVE' });
  }

  const sessionId = crypto.randomBytes(16).toString('hex');
  await redis(['SET', `session:${email}`, sessionId, 'EX', '86400']);
  await redis(['SET', `lastlogin:${email}`, new Date().toISOString()]);
  const fecha = new Date().toISOString().slice(0, 10);
  const token = crypto.createHmac('sha256', secret).update(`${email}:${fecha}`).digest('hex');

  return res.status(200).json({ email: usuario.email, rol: usuario.rol, cargo: usuario.cargo || '', token, sessionId });
}
