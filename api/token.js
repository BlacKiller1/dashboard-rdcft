// api/token.js — Retorna lista de usuarios solo a admins autenticados
import crypto from 'crypto';
import { getUsuarios } from './_db.js';

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

const ALLOWED_ORIGINS = [
  'https://arauco-rdcft.vercel.app',
  'http://localhost:5500',
  'http://127.0.0.1:5500'
];

function parseAuth(req) {
  try {
    const parts = (req.headers.authorization || '').split(' ');
    if (parts[0] !== 'Bearer' || !parts[1]) return null;
    return JSON.parse(Buffer.from(parts[1], 'base64').toString());
  } catch { return null; }
}

function verificarToken(email, token, secret) {
  try {
    const hoy  = new Date().toISOString().slice(0, 10);
    const ayer = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    for (const fecha of [hoy, ayer]) {
      const expected = crypto.createHmac('sha256', secret).update(`${email}:${fecha}`).digest('hex');
      if (token.length === expected.length &&
          crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))) return true;
    }
    return false;
  } catch { return false; }
}

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { type } = req.query;

  if (type === 'usuarios') {
    const creds = parseAuth(req);
    if (!creds?.email || !creds?.token) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    const secret = process.env.ADMIN_SECRET;
    if (!secret) return res.status(500).json({ error: 'Error interno' });

    if (!verificarToken(creds.email, creds.token, secret)) {
      return res.status(401).json({ error: 'Token inválido' });
    }

    // Validar sessionId contra Redis (si fue provisto)
    if (creds.sessionId) {
      const stored = await redis(['GET', `session:${creds.email}`]);
      if (!stored || stored !== creds.sessionId) {
        return res.status(401).json({ error: 'Sesión inválida o expirada. Vuelve a iniciar sesión.' });
      }
    }

    try {
      const usuarios = await getUsuarios();
      const usuario  = usuarios.find(u => u.email === creds.email);
      if (!usuario || usuario.rol !== 'admin') {
        return res.status(403).json({ error: 'Sin permisos de administrador' });
      }
      // Obtener último acceso de cada usuario en un solo MGET
      const lastLogins = usuarios.length > 0
        ? await redis(['MGET', ...usuarios.map(u => `lastlogin:${u.email}`)])
        : [];
      const usuariosConAcceso = usuarios.map((u, i) => ({
        ...u,
        lastlogin: lastLogins[i] || null
      }));
      return res.status(200).json({ usuarios: usuariosConAcceso });
    } catch {
      return res.status(500).json({ error: 'Error interno' });
    }
  }

  return res.status(404).json({ error: 'Recurso no encontrado' });
}
