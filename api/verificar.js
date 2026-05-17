// api/verificar.js — Verifica credenciales, controla sesión única via Redis
import crypto from 'crypto';
import { redis, setCorsHeaders } from './_auth.js';
import { getUsuarios } from './_db.js';

export default async function handler(req, res) {
  setCorsHeaders(req, res, 'POST, OPTIONS', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const { force } = req.body || {};
  const email = ((req.body || {}).email || '').trim().toLowerCase();
  if (!email.endsWith('@arauco.com')) {
    return res.status(400).json({ error: 'Solo se permiten correos @arauco.com' });
  }

  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    return res.status(500).json({ error: 'Error de configuración del servidor' });
  }

  const usuarios = await getUsuarios();

  const usuario = usuarios.find(u => u.email === email);
  if (!usuario) {
    return res.status(403).json({ error: 'Correo no registrado. Contacta al administrador.' });
  }

  // ── Sesión única: bloquear si ya hay sesión activa en otro dispositivo ──
  const sessionKey      = `session:${email}`;
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

  // Registrar último acceso (sin TTL — persiste para el log admin)
  await redis(['SET', `lastlogin:${email}`, new Date().toISOString()]);

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
