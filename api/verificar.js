// api/verificar.js — Verifica credenciales y emite sesión firmada
import crypto from 'crypto';

const ALLOWED_ORIGINS = [
  'https://arauco-rdcft.vercel.app',
  'http://localhost:5500',
  'http://127.0.0.1:5500'
];

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const email = ((req.body || {}).email || '').trim().toLowerCase();
  if (!email.endsWith('@arauco.com')) {
    return res.status(400).json({ error: 'Correo inválido' });
  }

  const secret      = process.env.ADMIN_SECRET;
  const usuariosRaw = process.env.USUARIOS_DB;
  if (!secret || !usuariosRaw) {
    return res.status(500).json({ error: 'Error de configuración del servidor' });
  }

  let usuarios;
  try { usuarios = JSON.parse(usuariosRaw).usuarios || []; }
  catch { return res.status(500).json({ error: 'Error interno' }); }

  const usuario = usuarios.find(u => u.email === email);
  if (!usuario) {
    return res.status(403).json({ error: 'Correo no registrado. Contacta al administrador.' });
  }

  const token = crypto.createHmac('sha256', secret).update(email).digest('hex');
  return res.status(200).json({
    email: usuario.email,
    rol:   usuario.rol,
    cargo: usuario.cargo || '',
    token
  });
}
