// api/soporte.js — Recibe requerimientos de soporte técnico desde el portal
import { enviarCorreo } from './_mail.js';

const TIPO_LABEL = {
  consulta: '❓ Consulta técnica',
  falla:    '🔴 Reporte de falla',
  mejora:   '🔧 Solicitud de mejora',
  otro:     '📋 Otro'
};

function esc(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const nombre  = (req.body?.nombre  || '').trim();
  const correo  = (req.body?.correo  || '').trim();
  const tipo    = (req.body?.tipo    || '').trim();
  const mensaje = (req.body?.mensaje || '').trim();

  if (!nombre || nombre.length < 2)
    return res.status(400).json({ error: 'Ingresa tu nombre.' });
  if (!correo || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo))
    return res.status(400).json({ error: 'Correo inválido.' });
  if (!TIPO_LABEL[tipo])
    return res.status(400).json({ error: 'Tipo de requerimiento inválido.' });
  if (!mensaje || mensaje.length < 10)
    return res.status(400).json({ error: 'El mensaje es demasiado corto.' });

  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD)
    return res.status(500).json({ error: 'Servicio de correo no configurado.' });

  const tipoLabel = TIPO_LABEL[tipo];
  const fecha     = new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' });

  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#f9f9f9;border-radius:10px;overflow:hidden;">
      <div style="background:#E8820A;padding:20px 28px;">
        <span style="color:#fff;font-size:18px;font-weight:700;letter-spacing:.1em;">arauco</span>
        <p style="color:rgba(255,255,255,.85);margin:4px 0 0;font-size:12px;">Portal Meteorológico RDCFT · Soporte Técnico</p>
      </div>
      <div style="padding:28px;">
        <p style="font-size:14px;color:#333;margin:0 0 20px;">Nuevo requerimiento de soporte técnico recibido desde el portal:</p>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr style="border-bottom:1px solid #eee;">
            <td style="padding:10px 12px;color:#888;width:110px;">Tipo</td>
            <td style="padding:10px 12px;color:#111;font-weight:600;">${esc(tipoLabel)}</td>
          </tr>
          <tr style="border-bottom:1px solid #eee;">
            <td style="padding:10px 12px;color:#888;">Nombre</td>
            <td style="padding:10px 12px;color:#111;font-weight:600;">${esc(nombre)}</td>
          </tr>
          <tr style="border-bottom:1px solid #eee;">
            <td style="padding:10px 12px;color:#888;">Correo</td>
            <td style="padding:10px 12px;"><a href="mailto:${esc(correo)}" style="color:#E8820A;font-weight:600;">${esc(correo)}</a></td>
          </tr>
          <tr style="border-bottom:1px solid #eee;">
            <td style="padding:10px 12px;color:#888;">Fecha</td>
            <td style="padding:10px 12px;color:#555;">${esc(fecha)}</td>
          </tr>
          <tr>
            <td style="padding:10px 12px;color:#888;vertical-align:top;">Descripción</td>
            <td style="padding:10px 12px;color:#111;line-height:1.6;white-space:pre-wrap;">${esc(mensaje)}</td>
          </tr>
        </table>
        <div style="margin-top:20px;padding:12px 16px;background:#fff3e0;border-left:3px solid #E8820A;border-radius:4px;font-size:12px;color:#666;">
          Responde directamente a este correo para contactar a <strong>${esc(nombre)}</strong> en <strong>${esc(correo)}</strong>.
        </div>
      </div>
    </div>
  `;

  try {
    await enviarCorreo({
      to:      process.env.GMAIL_USER,
      subject: `[Soporte] ${tipoLabel} — ${nombre}`,
      html,
      replyTo: correo
    });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[RDCFT] Error enviando soporte:', err);
    return res.status(500).json({ error: 'Error al enviar el mensaje. Intenta nuevamente.' });
  }
}
