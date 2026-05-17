// api/reset-pin.js — Restablecimiento de PIN para administradores
import crypto from 'crypto';
import { redis, setCorsHeaders } from './_auth.js';
import { getUsuarios } from './_db.js';
import { enviarCorreo } from './_mail.js';

const TOKEN_TTL = 900; // 15 minutos

function hashPin(pin, email) {
  const secret = process.env.ADMIN_SECRET || 'rdcft-fallback';
  return crypto.createHmac('sha256', secret).update(`${pin}:${email}`).digest('hex');
}

function esc(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export default async function handler(req, res) {
  setCorsHeaders(req, res, 'POST, OPTIONS', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const { action, email, token, pin } = req.body || {};

  // ── Solicitar enlace ───────────────────────────────────────────────────────
  if (action === 'request') {
    const cleanEmail = (email || '').trim().toLowerCase();
    if (!cleanEmail.endsWith('@arauco.com')) {
      return res.status(400).json({ error: 'Solo se permiten correos @arauco.com' });
    }

    // Siempre responder ok para no revelar si el email existe
    try {
      const usuarios = await getUsuarios();
      const usuario = usuarios.find(u => u.email === cleanEmail && u.rol === 'admin');
      if (usuario && process.env.GMAIL_USER) {
        const resetToken = crypto.randomBytes(32).toString('hex');
        await redis(['SET', `pin-reset:${resetToken}`, cleanEmail, 'EX', TOKEN_TTL]);
        const resetUrl = `https://arauco-rdcft.vercel.app?reset=${resetToken}`;
        await enviarCorreo({
          to: cleanEmail,
          subject: '[RDCFT] Restablecimiento de PIN de seguridad',
          html: buildResetEmail(cleanEmail, resetUrl)
        });
      }
    } catch (err) {
      console.error('[RDCFT] Error en reset-pin request:', err);
    }

    return res.status(200).json({ ok: true });
  }

  // ── Verificar token ────────────────────────────────────────────────────────
  if (action === 'verify') {
    if (!token) return res.status(400).json({ error: 'Token requerido' });
    const storedEmail = await redis(['GET', `pin-reset:${token}`]);
    if (!storedEmail) return res.status(404).json({ error: 'El enlace es inválido o ya expiró.' });
    return res.status(200).json({ ok: true, email: storedEmail });
  }

  // ── Establecer nuevo PIN ───────────────────────────────────────────────────
  if (action === 'set') {
    if (!token || !pin || String(pin).length < 4) {
      return res.status(400).json({ error: 'Datos incompletos o PIN demasiado corto.' });
    }
    const storedEmail = await redis(['GET', `pin-reset:${token}`]);
    if (!storedEmail) return res.status(404).json({ error: 'El enlace es inválido o ya expiró.' });

    const hash = hashPin(String(pin), storedEmail);
    await redis(['SET', `admin-pin:${storedEmail}`, hash]);
    await redis(['DEL', `pin-reset:${token}`]);

    return res.status(200).json({ ok: true });
  }

  return res.status(400).json({ error: 'Acción no reconocida' });
}

function buildResetEmail(email, resetUrl) {
  const nombre = email.split('@')[0].split('.')[0].toUpperCase();
  return `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#f9f9f9;border-radius:10px;overflow:hidden;">
      <div style="background:#1A52A8;padding:20px 28px;">
        <span style="color:#fff;font-size:18px;font-weight:700;letter-spacing:.1em;">arauco</span>
        <p style="color:rgba(255,255,255,.85);margin:4px 0 0;font-size:12px;">Dashboard RDCFT · Restablecimiento de PIN</p>
      </div>
      <div style="padding:32px 28px;color:#222;font-size:14px;line-height:1.7;">
        <p style="margin:0 0 16px;">Estimado(a) <strong>${esc(nombre)}</strong>,</p>
        <p style="margin:0 0 20px;">
          Recibimos una solicitud para restablecer el PIN de seguridad de tu cuenta de administrador.
        </p>
        <div style="margin:28px 0;text-align:center;">
          <a href="${resetUrl}"
             style="display:inline-block;background:#1A52A8;color:#fff;padding:14px 32px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;">
            Restablecer mi PIN &rarr;
          </a>
        </div>
        <p style="margin:0 0 8px;font-size:13px;color:#666;">
          &#9200; Este enlace es v&aacute;lido por <strong>15 minutos</strong>.
        </p>
        <p style="margin:0 0 20px;font-size:13px;color:#666;">
          Si no solicitaste este cambio, puedes ignorar este correo. Tu PIN actual permanecer&aacute; sin cambios.
        </p>
        <hr style="border:none;border-top:1px solid #eee;margin:20px 0;"/>
        <p style="margin:0;font-size:12px;color:#aaa;">${esc(email)} &middot; Dashboard RDCFT &mdash; Arauco</p>
      </div>
    </div>
  `;
}
