// api/historial.js — Historial de consultas de coordenadas por usuario (Redis LIST)
import crypto from 'crypto';

const HISTORIAL_MAX = 5;

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const creds = parseAuth(req);
  if (!creds?.email || !creds?.token) return res.status(401).json({ error: 'No autorizado' });

  const secret = process.env.ADMIN_SECRET;
  if (!secret) return res.status(500).json({ error: 'Error interno' });
  if (!verificarToken(creds.email, creds.token, secret)) return res.status(401).json({ error: 'Token inválido' });

  const key = `historial:${creds.email}`;

  // GET — devuelve las últimas N consultas
  if (req.method === 'GET') {
    try {
      const raw = await redis(['LRANGE', key, 0, HISTORIAL_MAX - 1]);
      return res.status(200).json({
        historial: (raw || []).map(item => JSON.parse(item))
      });
    } catch {
      return res.status(200).json({ historial: [] });
    }
  }

  // POST — guarda una nueva consulta al frente de la lista
  if (req.method === 'POST') {
    const { lat, lon, nombre, fecha } = req.body || {};
    if (typeof lat !== 'number' || typeof lon !== 'number') {
      return res.status(400).json({ error: 'Datos inválidos' });
    }
    const entry = JSON.stringify({
      lat,
      lon,
      nombre: (nombre || `${lat}, ${lon}`).slice(0, 60),
      fecha:  fecha || new Date().toISOString().slice(0, 10)
    });
    await redis(['LPUSH', key, entry]);
    await redis(['LTRIM', key, 0, HISTORIAL_MAX - 1]);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Método no permitido' });
}
