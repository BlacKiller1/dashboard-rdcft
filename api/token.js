// api/token.js — Vercel Serverless Function
// Retorna lista de usuarios solo a admins autenticados
import crypto from 'crypto';

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

export default function handler(req, res) {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { type } = req.query;

  if (type === 'usuarios') {
    const creds = parseAuth(req);
    if (!creds?.email || !creds?.token) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    const secret      = process.env.ADMIN_SECRET;
    const usuariosRaw = process.env.USUARIOS_DB;
    if (!secret || !usuariosRaw) return res.status(500).json({ error: 'Error interno' });

    if (!verificarToken(creds.email, creds.token, secret)) {
      return res.status(401).json({ error: 'Token inválido' });
    }

    try {
      const data    = JSON.parse(usuariosRaw);
      const usuario = (data.usuarios || []).find(u => u.email === creds.email);
      if (!usuario || usuario.rol !== 'admin') {
        return res.status(403).json({ error: 'Sin permisos de administrador' });
      }
      return res.status(200).json(data);
    } catch {
      return res.status(500).json({ error: 'Error interno' });
    }
  }

  return res.status(404).json({ error: 'Recurso no encontrado' });
}
