// api/verificar.js — Login con código OTP por correo + sesión única (Redis)
//
// Flujo de 2 pasos (mismo endpoint, discriminado por presencia de `codigo`):
//   PASO 1  POST { email, force? }          → envía código OTP al correo
//   PASO 2  POST { email, codigo }          → valida código y crea la sesión
import crypto from 'crypto';
import { redis, setCorsHeaders } from './_auth.js';
import { getUsuarios } from './_db.js';
import { enviarCorreo } from './_mail.js';

const OTP_TTL          = 600;  // vigencia del código: 10 min
const OTP_MAX_INTENTOS = 5;    // intentos de verificación por código
const OTP_COOLDOWN     = 60;   // segundos mínimos entre envíos

function hashOtp(email, codigo, secret) {
  return crypto.createHmac('sha256', secret).update(`${email}:${codigo}`).digest('hex');
}

function correoOtpHtml(codigo) {
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;background:#1a1713;border-radius:14px;overflow:hidden;border:1px solid #2c2822">
    <div style="background:#EA7600;padding:18px 24px;color:#fff;font-size:18px;font-weight:bold">Dashboard RDCFT — Arauco</div>
    <div style="padding:28px 24px;color:#e8e2d6">
      <p style="margin:0 0 14px;font-size:15px">Tu código de acceso es:</p>
      <div style="font-size:34px;font-weight:bold;letter-spacing:8px;color:#EA7600;text-align:center;margin:18px 0;font-family:monospace">${codigo}</div>
      <p style="margin:14px 0 0;font-size:13px;color:#a89e8c">Válido por 10 minutos. Si no solicitaste este acceso, ignora este correo.</p>
    </div>
  </div>`;
}

export default async function handler(req, res) {
  setCorsHeaders(req, res, 'POST, OPTIONS', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Método no permitido' });

  const body   = req.body || {};
  const email  = (body.email || '').trim().toLowerCase();
  const codigo = body.codigo ? String(body.codigo).trim() : null;
  const force  = !!body.force;

  if (!email.endsWith('@arauco.com')) {
    return res.status(400).json({ error: 'Solo se permiten correos @arauco.com' });
  }

  const secret = process.env.ADMIN_SECRET;
  if (!secret) return res.status(500).json({ error: 'Error de configuración del servidor' });

  const usuarios = await getUsuarios();
  const usuario  = usuarios.find(u => u.email === email);
  if (!usuario) {
    return res.status(403).json({ error: 'Correo no registrado. Contacta al administrador.' });
  }

  // ─────────── PASO 2: verificar código y crear sesión ───────────
  if (codigo) {
    const intentosKey = `otp-intentos:${email}`;
    const intentos    = parseInt(await redis(['INCR', intentosKey])) || 0;
    if (intentos === 1) await redis(['EXPIRE', intentosKey, String(OTP_TTL)]);
    if (intentos > OTP_MAX_INTENTOS) {
      return res.status(429).json({ error: 'Demasiados intentos. Solicita un nuevo código.' });
    }

    const stored = await redis(['GET', `otp:${email}`]);
    if (!stored) {
      return res.status(401).json({ error: 'Código expirado o inexistente. Solicita uno nuevo.' });
    }

    const expected = hashOtp(email, codigo, secret);
    let ok = false;
    try {
      ok = crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(stored, 'hex'));
    } catch { ok = false; }
    if (!ok) return res.status(401).json({ error: 'Código incorrecto.' });

    // Código válido → consumirlo
    await redis(['DEL', `otp:${email}`]);
    await redis(['DEL', intentosKey]);

    // Crear sesión (invalida la anterior si existía)
    const sessionId = crypto.randomBytes(16).toString('hex');
    await redis(['SET', `session:${email}`, sessionId, 'EX', '86400']); // TTL 24h
    await redis(['SET', `lastlogin:${email}`, new Date().toISOString()]);

    const fecha = new Date().toISOString().slice(0, 10);
    const token = crypto.createHmac('sha256', secret).update(`${email}:${fecha}`).digest('hex');

    return res.status(200).json({
      email: usuario.email,
      rol:   usuario.rol,
      cargo: usuario.cargo || '',
      token,
      sessionId
    });
  }

  // ─────────── PASO 1: solicitar código OTP ───────────
  // Sesión única: avisar si ya hay sesión activa en otro dispositivo (salvo force)
  const existingSession = await redis(['GET', `session:${email}`]);
  if (existingSession && !force) {
    return res.status(409).json({
      error: 'Ya existe una sesión activa con este correo en otro dispositivo.',
      code:  'SESSION_ACTIVE'
    });
  }

  // Rate-limit de envíos: máx 1 código cada OTP_COOLDOWN segundos
  const cooldownKey = `otp-cooldown:${email}`;
  if (await redis(['GET', cooldownKey])) {
    return res.status(429).json({ error: 'Espera un momento antes de solicitar otro código.' });
  }

  const otp = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  await redis(['SET', `otp:${email}`, hashOtp(email, otp, secret), 'EX', String(OTP_TTL)]);
  await redis(['DEL', `otp-intentos:${email}`]);
  await redis(['SET', cooldownKey, '1', 'EX', String(OTP_COOLDOWN)]);

  try {
    await enviarCorreo({
      to:      email,
      subject: 'Tu código de acceso · Dashboard RDCFT',
      html:    correoOtpHtml(otp)
    });
  } catch {
    await redis(['DEL', `otp:${email}`]);
    await redis(['DEL', cooldownKey]);
    return res.status(500).json({ error: 'No se pudo enviar el correo. Intenta más tarde.' });
  }

  return res.status(200).json({ ok: true, code: 'OTP_SENT' });
}
