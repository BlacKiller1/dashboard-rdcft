// api/login-pass.js — Login con contraseña (sin correo) + sesión única (Redis)
//
// POST { email, password, force? }
//   → valida contraseña personal (passhash:<email>) o el código maestro de
//     emergencia (env ACCESO_MAESTRO, "break-glass"), y crea la sesión.
import crypto from 'crypto';
import { redis, setCorsHeaders } from './_auth.js';
import { getUsuarios } from './_db.js';

const MAX_FAILS = 8;      // intentos fallidos por ventana
const FAIL_TTL  = 600;    // ventana de bloqueo: 10 min

function safeEq(a, b) {
  const A = Buffer.from(String(a)), B = Buffer.from(String(b));
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}

// passhash guardado como "saltHex:hashHex" (scrypt, con ADMIN_SECRET de pepper)
function verifyPassword(password, email, stored) {
  const secret = process.env.ADMIN_SECRET;
  const [saltHex, hashHex] = String(stored).split(':');
  if (!saltHex || !hashHex) return false;
  try {
    const derived = crypto.scryptSync(`${password}:${email}:${secret}`, Buffer.from(saltHex, 'hex'), 32);
    return crypto.timingSafeEqual(derived, Buffer.from(hashHex, 'hex'));
  } catch { return false; }
}

export default async function handler(req, res) {
  setCorsHeaders(req, res, 'POST, OPTIONS', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Método no permitido' });

  const body     = req.body || {};
  const email    = (body.email || '').trim().toLowerCase();
  const password = body.password ? String(body.password) : '';
  const force    = !!body.force;

  if (!email.endsWith('@arauco.com')) return res.status(400).json({ error: 'Solo se permiten correos @arauco.com' });
  if (!password)                      return res.status(400).json({ error: 'Ingresa tu contraseña.' });

  const secret = process.env.ADMIN_SECRET;
  if (!secret) return res.status(500).json({ error: 'Error de configuración del servidor' });

  const usuarios = await getUsuarios();
  const usuario  = usuarios.find(u => u.email === email);
  if (!usuario) return res.status(403).json({ error: 'Correo no registrado. Contacta al administrador.' });

  // Rate-limit de intentos fallidos
  const failKey = `passfail:${email}`;
  const fails   = parseInt(await redis(['GET', failKey])) || 0;
  if (fails >= MAX_FAILS) return res.status(429).json({ error: 'Demasiados intentos. Espera unos minutos e intenta de nuevo.' });

  const stored = await redis(['GET', `passhash:${email}`]);
  const master = process.env.ACCESO_MAESTRO || '';

  let ok = false;
  if (stored && verifyPassword(password, email, stored)) ok = true;
  else if (master && safeEq(password, master))           ok = true; // break-glass

  if (!ok) {
    const n = parseInt(await redis(['INCR', failKey])) || 1;
    if (n === 1) await redis(['EXPIRE', failKey, String(FAIL_TTL)]);
    return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
  }
  await redis(['DEL', failKey]);

  // Sesión única: avisar si ya hay sesión activa en otro dispositivo (salvo force)
  const existingSession = await redis(['GET', `session:${email}`]);
  if (existingSession && !force) {
    return res.status(409).json({ error: 'Ya existe una sesión activa con este correo en otro dispositivo.', code: 'SESSION_ACTIVE' });
  }

  const sessionId = crypto.randomBytes(16).toString('hex');
  await redis(['SET', `session:${email}`, sessionId, 'EX', '86400']);
  await redis(['SET', `lastlogin:${email}`, new Date().toISOString()]);

  const fecha = new Date().toISOString().slice(0, 10);
  const token = crypto.createHmac('sha256', secret).update(`${email}:${fecha}`).digest('hex');

  return res.status(200).json({
    email:  usuario.email,
    rol:    usuario.rol,
    cargo:  usuario.cargo || '',
    token,
    sessionId,
    mustSetPassword: !stored   // entró con el código maestro (aún sin contraseña propia)
  });
}
