// api/soporte.js — Soporte técnico y Avisos RDCFT
import { enviarCorreo } from './_mail.js';

export const config = { api: { bodyParser: { sizeLimit: '6mb' } } };

// ── Aviso RDCFT ──────────────────────────────────────────────────────────────
async function handleAvisoRDCFT(req, res) {
  const { destinatario, imagenBase64, datos } = req.body || {};
  if (!destinatario) return res.status(400).json({ error: 'Destinatario requerido' });

  const {
    correlativo = '', responsable = '', fechaHora = '',
    region = '', comuna = '', predio = '',
    tipoActividad = '', combustible = '', superficie = '',
    coordenadas = '', sector = '', observacion = ''
  } = datos || {};

  const partes = coordenadas.split(',').map(s => parseFloat(s.trim()));
  const tieneCoords = partes.length >= 2 && !isNaN(partes[0]) && !isNaN(partes[1]);
  const [lat, lon] = tieneCoords ? partes : [null, null];

  const linksHtml = tieneCoords ? `
    <div style="margin:20px 0 0;padding:16px 20px;background:#f1efe8;border-radius:8px;font-family:Arial,sans-serif;">
      <p style="margin:0 0 10px;font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:#6f6f66;">
        📍 Ver ubicación del predio
      </p>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px;">
        <a href="https://www.google.com/maps/search/?api=1&query=${lat},${lon}"
           style="display:inline-block;background:#d6611e;color:#fff;text-decoration:none;
                  padding:9px 16px;border-radius:6px;font-size:13px;font-weight:600;">
          🗺 Abrir en Google Maps
        </a>
        <a href="https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=15/${lat}/${lon}"
           style="display:inline-block;background:#234734;color:#fff;text-decoration:none;
                  padding:9px 16px;border-radius:6px;font-size:13px;font-weight:600;">
          🌍 OpenStreetMap
        </a>
      </div>
      <p style="margin:0;font-family:'Courier New',monospace;font-size:12px;color:#2e5a41;">
        Coordenadas: ${coordenadas}
      </p>
    </div>` : '';

  const imgHtml = imagenBase64
    ? `<img src="data:image/jpeg;base64,${imagenBase64}"
            style="max-width:100%;display:block;border-radius:6px;box-shadow:0 2px 16px rgba(0,0,0,.12);"
            alt="Aviso RDCFT ${correlativo}">`
    : '';

  const resumenHtml = `
    <table style="width:100%;border-collapse:collapse;font-size:13px;font-family:Arial,sans-serif;margin-top:16px;">
      <tr><td style="padding:5px 10px 5px 0;color:#6f6f66;width:130px;">Responsable</td><td style="font-weight:500;">${responsable || '—'}</td></tr>
      <tr><td style="padding:5px 10px 5px 0;color:#6f6f66;">Región / Comuna</td><td style="font-weight:500;">${region || '—'} / ${comuna || '—'}</td></tr>
      <tr><td style="padding:5px 10px 5px 0;color:#6f6f66;">Predio</td><td style="font-weight:500;">${predio || '—'}</td></tr>
      <tr><td style="padding:5px 10px 5px 0;color:#6f6f66;">Actividad</td><td style="font-weight:500;">${tipoActividad || '—'}</td></tr>
      <tr><td style="padding:5px 10px 5px 0;color:#6f6f66;">Combustible</td><td style="font-weight:500;">${combustible || '—'}</td></tr>
      <tr><td style="padding:5px 10px 5px 0;color:#6f6f66;">Superficie</td><td style="font-weight:500;">${superficie || '—'}</td></tr>
      ${observacion ? `<tr><td style="padding:5px 10px 5px 0;color:#6f6f66;vertical-align:top;">Observación</td><td style="font-weight:500;">${observacion}</td></tr>` : ''}
    </table>`;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;background:#ffffff;">
      <div style="background:#234734;padding:18px 24px;border-radius:8px 8px 0 0;">
        <span style="font-weight:800;font-size:18px;letter-spacing:.05em;text-transform:uppercase;color:#ffffff;">
          🔥 Aviso RDCFT Arauco
        </span>
        ${correlativo ? `<span style="font-size:12px;color:#bcd1c2;margin-left:14px;font-family:'Courier New',monospace;">${correlativo}</span>` : ''}
      </div>
      <div style="background:#fbead9;border-left:4px solid #d6611e;padding:13px 20px;">
        <p style="margin:0;font-size:13px;color:#7a4218;">
          Junto con saludar, se informa la ejecución de actividades asociadas a
          <strong>reducción de combustible y fuego técnico</strong>.
          Aviso emitido por <strong>${responsable || '—'}</strong> · ${fechaHora}
        </p>
      </div>
      <div style="padding:20px 24px 0;">${imgHtml}</div>
      <div style="padding:0 24px;">${linksHtml}</div>
      <div style="padding:8px 24px 20px;">${resumenHtml}</div>
      <div style="background:#f1efe8;padding:14px 24px;text-align:center;border-top:1px solid #e3e1d8;border-radius:0 0 8px 8px;">
        <p style="margin:0;font-size:11px;color:#6f6f66;letter-spacing:.06em;text-transform:uppercase;">
          Sistema de Avisos RDCFT — Gestión Operacional de Quemas Controladas · Arauco
        </p>
      </div>
    </div>`;

  try {
    await enviarCorreo({
      to: destinatario,
      subject: `Aviso RDCFT ${correlativo} — ${predio || 'Predio sin nombre'}`,
      html
    });
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('aviso-rdcft error:', e);
    return res.status(500).json({ error: 'Error al enviar correo' });
  }
}

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

  if (req.body?.servicio === 'aviso-rdcft') return handleAvisoRDCFT(req, res);

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
