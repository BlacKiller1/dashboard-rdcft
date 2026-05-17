// api/feedback.js — Recibe sugerencias, consultas y mejoras del dashboard
import { setCorsHeaders } from './_auth.js';
import { enviarCorreo } from './_mail.js';

const TIPO_LABEL = {
  recomendacion: '💡 Recomendación',
  consulta:      '❓ Consulta',
  mejora:        '🔧 Mejora'
};

function esc(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export default async function handler(req, res) {
  setCorsHeaders(req, res, 'POST, OPTIONS', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const tipo    = (req.body?.tipo    || '').trim();
  const mensaje = (req.body?.mensaje || '').trim();
  const email   = (req.body?.email   || 'anónimo').trim();

  if (!mensaje || mensaje.length < 10) {
    return res.status(400).json({ error: 'El mensaje es demasiado corto.' });
  }
  if (!TIPO_LABEL[tipo]) {
    return res.status(400).json({ error: 'Tipo de mensaje inválido.' });
  }

  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    return res.status(500).json({ error: 'Servicio de correo no configurado.' });
  }

  const tipoLabel = TIPO_LABEL[tipo];
  const fecha     = new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' });

  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#f9f9f9;border-radius:10px;overflow:hidden;">
      <div style="background:#E8820A;padding:20px 28px;">
        <span style="color:#fff;font-size:18px;font-weight:700;letter-spacing:.1em;">arauco</span>
        <p style="color:rgba(255,255,255,.85);margin:4px 0 0;font-size:12px;">Dashboard RDCFT · ${esc(tipoLabel)}</p>
      </div>
      <div style="padding:28px;">
        <p style="font-size:14px;color:#333;margin:0 0 20px;">Se ha recibido un nuevo mensaje desde el dashboard:</p>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr style="border-bottom:1px solid #eee;">
            <td style="padding:10px 12px;color:#888;width:80px;">Tipo</td>
            <td style="padding:10px 12px;color:#111;font-weight:600;">${esc(tipoLabel)}</td>
          </tr>
          <tr style="border-bottom:1px solid #eee;">
            <td style="padding:10px 12px;color:#888;">Usuario</td>
            <td style="padding:10px 12px;color:#E8820A;font-weight:600;">${esc(email)}</td>
          </tr>
          <tr style="border-bottom:1px solid #eee;">
            <td style="padding:10px 12px;color:#888;">Fecha</td>
            <td style="padding:10px 12px;color:#555;">${esc(fecha)}</td>
          </tr>
          <tr>
            <td style="padding:10px 12px;color:#888;vertical-align:top;">Mensaje</td>
            <td style="padding:10px 12px;color:#111;line-height:1.6;white-space:pre-wrap;">${esc(mensaje)}</td>
          </tr>
        </table>
      </div>
    </div>
  `;

  try {
    await enviarCorreo({
      to:      process.env.GMAIL_USER,
      subject: `[RDCFT] ${tipoLabel} — ${email}`,
      html
    });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[RDCFT] Error enviando feedback:', err);
    return res.status(500).json({ error: 'Error al enviar el mensaje. Intenta nuevamente.' });
  }
}
