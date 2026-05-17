// api/_auth.js — Utilitarios compartidos de autenticación y Redis
import crypto from 'crypto';

export const ALLOWED_ORIGINS = [
  'https://arauco-rdcft.vercel.app',
  'http://localhost:5500',
  'http://127.0.0.1:5500'
];

export function setCorsHeaders(req, res, methods, extraHeaders) {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', extraHeaders);
}

export async function redis(command) {
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

export function parseAuth(req) {
  try {
    const parts = (req.headers.authorization || '').split(' ');
    if (parts[0] !== 'Bearer' || !parts[1]) return null;
    return JSON.parse(Buffer.from(parts[1], 'base64').toString());
  } catch { return null; }
}

export function verificarToken(email, token, secret) {
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
