// api/_mail.js — Helper para envío de correos via Gmail SMTP
import nodemailer from 'nodemailer';

export function crearTransporte() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD
    }
  });
}

export async function enviarCorreo({ to, subject, html }) {
  const transporter = crearTransporte();
  await transporter.sendMail({
    from: `"Dashboard RDCFT" <${process.env.GMAIL_USER}>`,
    to,
    subject,
    html
  });
}
