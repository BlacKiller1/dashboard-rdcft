// api/admin-pin.js — PIN de seguridad secundario para administradores
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

function hashPin(pin, email) {
  const secret = process.env.ADMIN_SECRET || 'rdcft-fallback';
  return crypto.createHmac('sha256', secret).update(`${pin}:${email}`).digest('hex');
}

async function parseAuth(req) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return null;
  try {
    const decoded = JSON.parse(Buffer.from(auth.slice(7), 'base64').toString());
    const { email, token, sessionId } = decoded;
    if (!email || !token || !sessionId) return null;

    const secret = process.env.ADMIN_SECRET;
    if (!secret) return null;
    const fecha = new Date().toISOString().slice(0, 10);
    const esperado = crypto.createHmac('sha256', secret).update(`${email}:${fecha}`).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(esperado, 'hex'))) return null;

    const storedSession = await redis(['GET', `session:${email}`]);
    if (storedSession !== sessionId) return null;

    return { email };
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const auth = await parseAuth(req);
  if (!auth) return res.status(401).json({ error: 'No autorizado' });

  const { action, pin } = req.body || {};

  if (action === 'check') {
    const existing = await redis(['GET', `admin-pin:${auth.email}`]);
    return res.status(200).json({ hasPin: !!existing });
  }

  if (action === 'verify') {
    if (!pin || String(pin).length < 4) return res.status(400).json({ error: 'PIN requerido' });
    const stored = await redis(['GET', `admin-pin:${auth.email}`]);
    if (!stored) return res.status(404).json({ error: 'PIN no configurado' });
    const hash = hashPin(String(pin), auth.email);
    let match = false;
    try {
      match = crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(stored, 'hex'));
    } catch { match = false; }
    if (!match) return res.status(401).json({ error: 'PIN incorrecto' });
    return res.status(200).json({ ok: true });
  }

  if (action === 'set') {
    if (!pin || String(pin).length < 4) {
      return res.status(400).json({ error: 'El PIN debe tener al menos 4 caracteres' });
    }
    const hash = hashPin(String(pin), auth.email);
    await redis(['SET', `admin-pin:${auth.email}`, hash]);
    return res.status(200).json({ ok: true });
  }

  return res.status(400).json({ error: 'Acción no reconocida' });
}
