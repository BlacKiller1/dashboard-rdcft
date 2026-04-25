// api/token.js — Vercel Serverless Function
// Expone token y usuarios desde variables de entorno de forma segura
export default function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', 'https://arauco-rdcft.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { type } = req.query;

  if (type === 'usuarios') {
    const usuariosRaw = process.env.USUARIOS_DB;
    if (!usuariosRaw) return res.status(500).json({ error: 'Usuarios no configurados' });
    try {
      const data = JSON.parse(usuariosRaw);
      return res.status(200).json(data);
    } catch {
      return res.status(500).json({ error: 'Error parseando usuarios' });
    }
  }

  // Default: retornar token
  const token = process.env.GITHUB_TOKEN;
  if (!token) return res.status(500).json({ error: 'Token no configurado' });
  return res.status(200).json({ token });
}