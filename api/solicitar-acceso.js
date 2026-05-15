// api/solicitar-acceso.js — Envía solicitud de acceso al administrador
import { enviarCorreo } from './_mail.js';

const ALLOWED_ORIGINS = [
  'https://arauco-rdcft.vercel.app',
  'http://localhost:5500',
  'http://127.0.0.1:5500'
];

function esc(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const nombre = (req.body?.nombre || '').trim();
  const cargo  = (req.body?.cargo  || '').trim();
  const email  = (req.body?.email  || '').trim().toLowerCase();

  if (!nombre || !cargo || !email) {
    return res.status(400).json({ error: 'Todos los campos son requeridos' });
  }
  if (!email.includes('@') || email.length < 5) {
    return res.status(400).json({ error: 'Correo electrónico inválido' });
  }

  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    return res.status(500).json({ error: 'Servicio de correo no configurado' });
  }

  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#f9f9f9;border-radius:10px;overflow:hidden;">
      <div style="background:#E8820A;padding:20px 28px;">
        <span style="color:#fff;font-size:18px;font-weight:700;letter-spacing:.1em;">arauco</span>
        <p style="color:rgba(255,255,255,.85);margin:4px 0 0;font-size:12px;">Dashboard RDCFT · Solicitud de acceso</p>
      </div>
      <div style="padding:28px;">
        <p style="font-size:14px;color:#333;margin:0 0 20px;">Se ha recibido una nueva solicitud de acceso al dashboard:</p>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr style="border-bottom:1px solid #eee;">
            <td style="padding:10px 12px;color:#888;width:100px;">Nombre</td>
            <td style="padding:10px 12px;color:#111;font-weight:600;">${esc(nombre)}</td>
          </tr>
          <tr style="border-bottom:1px solid #eee;">
            <td style="padding:10px 12px;color:#888;">Cargo</td>
            <td style="padding:10px 12px;color:#111;font-weight:600;">${esc(cargo)}</td>
          </tr>
          <tr>
            <td style="padding:10px 12px;color:#888;">Correo</td>
            <td style="padding:10px 12px;color:#E8820A;font-weight:600;">${esc(email)}</td>
          </tr>
        </table>
        <p style="font-size:12px;color:#999;margin:24px 0 0;border-top:1px solid #eee;padding-top:16px;">
          Para agregar este usuario, inicia sesión en el dashboard y usa el panel de administración.
        </p>
      </div>
    </div>
  `;

  try {
    await enviarCorreo({
      to: process.env.GMAIL_USER,
      subject: `[RDCFT] Solicitud de acceso — ${nombre}`,
      html
    });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[RDCFT] Error enviando solicitud:', err);
    return res.status(500).json({ error: 'Error al enviar la solicitud. Intenta nuevamente.' });
  }
}
