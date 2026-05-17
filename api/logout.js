// api/logout.js — Invalida la sesión en Redis
import { redis, setCorsHeaders } from './_auth.js';

export default async function handler(req, res) {
  setCorsHeaders(req, res, 'POST, OPTIONS', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const parts = (req.headers.authorization || '').split(' ');
    if (parts[0] === 'Bearer' && parts[1]) {
      const { email } = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      if (email) await redis(['DEL', `session:${email}`]);
    }
  } catch {}

  res.status(200).json({ ok: true });
}
