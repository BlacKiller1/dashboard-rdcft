// api/historial.js — Historial de consultas de coordenadas por usuario (Redis LIST)
import { redis, setCorsHeaders, parseAuth, verificarToken } from './_auth.js';

const HISTORIAL_MAX = 5;

export default async function handler(req, res) {
  setCorsHeaders(req, res, 'GET, POST, OPTIONS', 'Content-Type, Authorization');

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
