// api/usuarios.js — Actualizar usuarios en Redis (requiere sesión de admin firmada)
import crypto from 'crypto';
import { getUsuarios, setUsuarios } from './_db.js';
import { enviarCorreo } from './_mail.js';

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

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  // ── Autenticación ──────────────────────────────────────────────────────────
  const creds = parseAuth(req);
  if (!creds?.email || !creds?.token) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    return res.status(500).json({ error: 'Variables no configuradas' });
  }

  if (!verificarToken(creds.email, creds.token, secret)) {
    return res.status(401).json({ error: 'Token inválido' });
  }

  // Validar sessionId contra Redis
  if (creds.sessionId) {
    try {
      const stored = await redis(['GET', `session:${creds.email}`]);
      if (!stored || stored !== creds.sessionId) {
        return res.status(401).json({ error: 'Sesión inválida o expirada. Vuelve a iniciar sesión.' });
      }
    } catch (redisErr) {
      console.warn('[RDCFT] Redis no disponible:', redisErr.message);
    }
  }

  // Verificar rol admin
  const existingUsuarios = await getUsuarios();
  const requestUser = existingUsuarios.find(u => u.email === creds.email);
  if (!requestUser || requestUser.rol !== 'admin') {
    return res.status(403).json({ error: 'Sin permisos de administrador' });
  }

  // ── Validar payload ────────────────────────────────────────────────────────
  const { usuarios } = req.body || {};
  if (!Array.isArray(usuarios)) return res.status(400).json({ error: 'Datos inválidos' });

  try {
    // Guardar en Redis — instantáneo, sin redeploy
    await setUsuarios(usuarios);

    // Enviar correo de bienvenida a usuarios recién agregados
    const emailsExistentes = new Set(existingUsuarios.map(u => u.email));
    const nuevos = usuarios.filter(u => !emailsExistentes.has(u.email));
    if (nuevos.length > 0 && process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
      try {
        await Promise.all(nuevos.map(u => enviarBienvenida(u)));
      } catch (e) {
        console.warn('[RDCFT] Error enviando correos de bienvenida:', e);
      }
    }

    return res.status(200).json({
      ok: true,
      total: usuarios.length,
      mensaje: 'Usuarios actualizados correctamente.'
    });

  } catch (err) {
    console.error('[RDCFT] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}

function esc(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function nombreDeEmail(email) {
  const local = email.split('@')[0];
  const primera = local.split('.')[0];
  return primera.toUpperCase();
}

function idDeEmail(email) {
  let hash = 0;
  for (const c of email) hash = (hash * 31 + c.charCodeAt(0)) & 0xffff;
  return 1000 + (hash % 9000);
}

async function enviarBienvenida(usuario) {
  const nombre = nombreDeEmail(usuario.email);
  const idUser = idDeEmail(usuario.email);
  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#f9f9f9;border-radius:10px;overflow:hidden;">
      <div style="background:#E8820A;padding:20px 28px;">
        <span style="color:#fff;font-size:18px;font-weight:700;letter-spacing:.1em;">arauco</span>
        <p style="color:rgba(255,255,255,.85);margin:4px 0 0;font-size:12px;">Dashboard RDCFT · Notificación automática</p>
      </div>
      <div style="padding:32px 28px;color:#222;font-size:14px;line-height:1.7;">
        <p style="margin:0 0 20px;">
          Estimado(a): <strong>${esc(nombre)}</strong>
          <span style="color:#888;font-size:12px;margin-left:8px;">[ID-USER: ${idUser}]</span>
        </p>
        <p style="margin:0 0 20px;">
          Le informamos que sus credenciales de acceso han sido habilitadas exitosamente en la plataforma.
        </p>
        <div style="margin:24px 0;text-align:center;">
          <a href="https://arauco-rdcft.vercel.app"
             style="display:inline-block;background:#E8820A;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;">
            Ingresar al Dashboard →
          </a>
        </div>
        <p style="margin:20px 0 0;">
          Si presenta inconvenientes o requiere soporte adicional, por favor responda a este hilo de comunicación.
        </p>
        <p style="margin:24px 0 0;">Atentamente,</p>
        <p style="margin:4px 0 0;font-weight:600;">Equipo Dashboard RDCFT — Arauco</p>
        <p style="margin:4px 0 0;font-size:12px;color:#888;">${esc(usuario.email)}</p>
      </div>
    </div>
  `;

  await enviarCorreo({
    to: usuario.email,
    subject: '[NOTIFICACIÓN AUTOMÁTICA] - Confirmación de Acceso',
    html
  });
  console.log('[RDCFT] Correo de bienvenida enviado a:', usuario.email);
}
