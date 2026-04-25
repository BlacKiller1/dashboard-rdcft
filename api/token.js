// api/token.js — Vercel Serverless Function
// Expone el token de GitHub de forma segura desde variables de entorno
export default function handler(req, res) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'Token no configurado' });
  }
  res.status(200).json({ token });
}
