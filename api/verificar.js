// api/verificar.js — Verifica credenciales, controla sesión única via Redis
import crypto from 'crypto';

const ALLOWED_ORIGINS = [
  'https://arauco-rdcft.vercel.app',
  'http://localhost:5500',
  'http://127.0.0.1:5500'
];

async function redis(command) {
  const res = await fetch(process.env.UPSTASH_REDIS_REST_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(command)
  });
  return (await res.json()).result;
}

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const { force } = req.body || {};
  const email = ((req.body || {}).email || '').trim().toLowerCase();
  if (!email.endsWith('@arauco.com')) {
    return res.status(400).json({ error: 'Solo se permiten correos @arauco.com' });
  }

  const secret      = process.env.ADMIN_SECRET;
  const usuariosRaw = process.env.USUARIOS_DB;
  if (!secret || !usuariosRaw) {
    return res.status(500).json({ error: 'Error de configuración del servidor' });
  }

  let usuarios;
  try { usuarios = JSON.parse(usuariosRaw).usuarios || []; }
  catch { return res.status(500).json({ error: 'Error interno' }); }

  const usuario = usuarios.find(u => u.email === email);
  if (!usuario) {
    return res.status(403).json({ error: 'Correo no registrado. Contacta al administrador.' });
  }

  // ── Sesión única: bloquear si ya hay sesión activa en otro dispositivo ──
  const sessionKey     = `session:${email}`;
  const existingSession = await redis(['GET', sessionKey]);
  if (existingSession && !force) {
    return res.status(409).json({
      error: 'Ya existe una sesión activa con este correo en otro dispositivo.',
      code:  'SESSION_ACTIVE'
    });
  }

  // Generar nuevo sessionId (invalida la sesión anterior si existía)
  const sessionId = crypto.randomBytes(16).toString('hex');
  await redis(['SET', sessionKey, sessionId, 'EX', '86400']); // TTL 24h

  const fecha = new Date().toISOString().slice(0, 10);
  const token = crypto.createHmac('sha256', secret).update(`${email}:${fecha}`).digest('hex');

  return res.status(200).json({
    email:     usuario.email,
    rol:       usuario.rol,
    cargo:     usuario.cargo || '',
    token,
    sessionId
  });
}
