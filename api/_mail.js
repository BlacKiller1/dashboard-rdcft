// api/_mail.js — Helper para envío de correos vía Brevo (API HTTP)
//
// Reemplaza Gmail SMTP (bloqueado) por la API transaccional de Brevo, que no
// requiere DNS: basta verificar UN remitente en Brevo y una API key.
//
// Variables de entorno (Vercel):
//   BREVO_API_KEY     API key de Brevo (Settings → SMTP & API → API Keys)
//   BREVO_SENDER      Correo remitente verificado en Brevo (Senders)
//   BREVO_SENDER_NAME Nombre visible (opcional, por defecto "Dashboard RDCFT")

export const ADMINS_CC = [
  'fredy.rojas@arauco.com',
  'johany.gonzalez@arauco.com',
  'alex.cona@arauco.com',
].join(',');

function aLista(valor) {
  return String(valor || '')
    .split(',')
    .map(e => e.trim())
    .filter(Boolean)
    .map(email => ({ email }));
}

export async function enviarCorreo({ to, subject, html, cc, replyTo }) {
  const apiKey      = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER;
  if (!apiKey || !senderEmail) {
    throw new Error('Correo no configurado: falta BREVO_API_KEY o BREVO_SENDER');
  }
  const senderName = process.env.BREVO_SENDER_NAME || 'Dashboard RDCFT';

  const payload = {
    sender:      { email: senderEmail, name: senderName },
    to:          aLista(to),
    subject,
    htmlContent: html,
  };
  const ccList = aLista(cc);
  if (ccList.length)          payload.cc      = ccList;
  if (replyTo)               payload.replyTo = { email: replyTo };

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method:  'POST',
    headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
    body:    JSON.stringify(payload),
  });

  if (!res.ok) {
    const detalle = await res.text().catch(() => '');
    throw new Error(`Brevo ${res.status}: ${detalle}`);
  }
  return res.json().catch(() => ({}));
}
