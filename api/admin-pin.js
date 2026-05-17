// api/admin-pin.js — PIN de seguridad secundario para administradores
import crypto from 'crypto';
import { redis, setCorsHeaders, parseAuth, verificarToken } from './_auth.js';

function hashPin(pin, email) {
  const secret = process.env.ADMIN_SECRET || 'rdcft-fallback';
  return crypto.createHmac('sha256', secret).update(`${pin}:${email}`).digest('hex');
}

export default async function handler(req, res) {
  setCorsHeaders(req, res, 'POST, OPTIONS', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  // ── Autenticación ──────────────────────────────────────────────────────────
  const creds = parseAuth(req);
  if (!creds?.email || !creds?.token || !creds?.sessionId) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const secret = process.env.ADMIN_SECRET;
  if (!secret) return res.status(500).json({ error: 'Error interno' });

  // verificarToken chequea hoy y ayer — corrige el bug de medianoche
  if (!verificarToken(creds.email, creds.token, secret)) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const storedSession = await redis(['GET', `session:${creds.email}`]);
  if (storedSession !== creds.sessionId) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const { action, pin } = req.body || {};

  if (action === 'check') {
    const existing = await redis(['GET', `admin-pin:${creds.email}`]);
    return res.status(200).json({ hasPin: !!existing });
  }

  if (action === 'verify') {
    if (!pin || String(pin).length < 4) return res.status(400).json({ error: 'PIN requerido' });
    const stored = await redis(['GET', `admin-pin:${creds.email}`]);
    if (!stored) return res.status(404).json({ error: 'PIN no configurado' });
    const hash = hashPin(String(pin), creds.email);
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
    const hash = hashPin(String(pin), creds.email);
    await redis(['SET', `admin-pin:${creds.email}`, hash]);
    return res.status(200).json({ ok: true });
  }

  return res.status(400).json({ error: 'Acción no reconocida' });
}
