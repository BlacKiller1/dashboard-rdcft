// api/ping-sesion.js — Verifica si el sessionId del cliente sigue activo en Redis
import { redis, setCorsHeaders } from './_auth.js';

export default async function handler(req, res) {
  setCorsHeaders(req, res, 'GET, OPTIONS', 'Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  try {
    const parts = (req.headers.authorization || '').split(' ');
    if (parts[0] !== 'Bearer' || !parts[1]) return res.status(401).json({ valid: false });
    const { email, sessionId } = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    if (!email || !sessionId) return res.status(401).json({ valid: false });

    const stored = await redis(['GET', `session:${email}`]);
    if (!stored || stored !== sessionId) {
      return res.status(401).json({ valid: false });
    }
    return res.status(200).json({ valid: true });
  } catch {
    return res.status(500).json({ valid: false });
  }
}
