// api/password.js — Gestión de contraseñas (sesión firmada requerida)
//
// POST { action, ... }  con Authorization: Bearer <credenciales>
//   action 'change'  { newPassword }                     → cambia la propia
//   action 'set'     { targetEmail, newPassword }  (admin)→ asigna a un usuario
//   action 'clear'   { targetEmail }               (admin)→ borra (vuelve a código maestro)
//   action 'status'                                (admin)→ { status: {email: bool} }
import crypto from 'crypto';
import { redis, setCorsHeaders, parseAuth, verificarToken } from './_auth.js';
import { getUsuarios, pushAuditLog } from './_db.js';

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

function safeEq(a, b) {
  const A = Buffer.from(String(a)), B = Buffer.from(String(b));
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}

export default async function handler(req, res) {
  setCorsHeaders(req, res, 'POST, OPTIONS', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Método no permitido' });

  const creds = parseAuth(req);
  if (!creds?.email || !creds?.token || !creds?.sessionId) return res.status(401).json({ error: 'No autorizado' });

  const secret = process.env.ADMIN_SECRET;
  if (!secret) return res.status(500).json({ error: 'Error interno' });
  if (!verificarToken(creds.email, creds.token, secret)) return res.status(401).json({ error: 'Token inválido' });

  const storedSession = await redis(['GET', `session:${creds.email}`]);
  if (!storedSession || storedSession !== creds.sessionId) {
    return res.status(401).json({ error: 'Sesión inválida o expirada. Vuelve a iniciar sesión.' });
  }

  const usuarios = await getUsuarios();
  const me = usuarios.find(u => u.email === creds.email);
  if (!me) return res.status(403).json({ error: 'Usuario no válido' });

  const { action, newPassword, targetEmail } = req.body || {};

  // ── Cambiar la propia contraseña ────────────────────────────────────────
  if (action === 'change') {
    if (!newPassword || String(newPassword).length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
    }
    const stored = await redis(['GET', `passhash:${creds.email}`]);
    // Si ya tiene contraseña, exige la actual (o el código maestro como recuperación).
    // Si no tiene (primer ingreso vía código maestro), la crea sin pedir la actual.
    if (stored) {
      const cur    = req.body.currentPassword ? String(req.body.currentPassword) : '';
      const master = process.env.ACCESO_MAESTRO || '';
      const okCur  = (cur && verifyPassword(cur, creds.email, stored)) || (master && cur && safeEq(cur, master));
      if (!okCur) return res.status(401).json({ error: 'La contraseña actual es incorrecta.' });
    }
    await redis(['SET', `passhash:${creds.email}`, hashPassword(String(newPassword), creds.email)]);
    await pushAuditLog({ admin: creds.email, accion: 'set_password', usuario: creds.email, detalle: stored ? 'Cambió su contraseña' : 'Creó su contraseña (primer ingreso)' }).catch(() => {});
    return res.status(200).json({ ok: true });
  }

  // ── Acciones de administrador ───────────────────────────────────────────
  if (me.rol !== 'admin') return res.status(403).json({ error: 'Sin permisos de administrador' });

  if (action === 'status') {
    const keys = usuarios.map(u => `passhash:${u.email}`);
    const vals = keys.length ? await redis(['MGET', ...keys]) : [];
    const status = {};
    usuarios.forEach((u, i) => { status[u.email] = !!(Array.isArray(vals) && vals[i]); });
    return res.status(200).json({ status });
  }

  const tgt = (targetEmail || '').trim().toLowerCase();
  if (!tgt || !usuarios.find(u => u.email === tgt)) {
    return res.status(400).json({ error: 'Usuario destino no válido' });
  }

  if (action === 'set') {
    if (!newPassword || String(newPassword).length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
    }
    await redis(['SET', `passhash:${tgt}`, hashPassword(String(newPassword), tgt)]);
    await pushAuditLog({ admin: creds.email, accion: 'set_password', usuario: tgt, detalle: 'Contraseña asignada por administrador' }).catch(() => {});
    return res.status(200).json({ ok: true });
  }

  if (action === 'clear') {
    await redis(['DEL', `passhash:${tgt}`]);
    await pushAuditLog({ admin: creds.email, accion: 'clear_password', usuario: tgt, detalle: 'Contraseña eliminada (vuelve al código maestro)' }).catch(() => {});
    return res.status(200).json({ ok: true });
  }

  return res.status(400).json({ error: 'Acción no reconocida' });
}
