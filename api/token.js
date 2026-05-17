// api/token.js — Retorna lista de usuarios solo a admins autenticados
import { redis, setCorsHeaders, parseAuth, verificarToken } from './_auth.js';
import { getUsuarios } from './_db.js';

export default async function handler(req, res) {
  setCorsHeaders(req, res, 'GET, OPTIONS', 'Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { type } = req.query;

  if (type === 'usuarios') {
    const creds = parseAuth(req);
    if (!creds?.email || !creds?.token) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    const secret = process.env.ADMIN_SECRET;
    if (!secret) return res.status(500).json({ error: 'Error interno' });

    if (!verificarToken(creds.email, creds.token, secret)) {
      return res.status(401).json({ error: 'Token inválido' });
    }

    // Validar sessionId contra Redis (si fue provisto)
    if (creds.sessionId) {
      const stored = await redis(['GET', `session:${creds.email}`]);
      if (!stored || stored !== creds.sessionId) {
        return res.status(401).json({ error: 'Sesión inválida o expirada. Vuelve a iniciar sesión.' });
      }
    }

    try {
      const usuarios = await getUsuarios();
      const usuario  = usuarios.find(u => u.email === creds.email);
      if (!usuario || usuario.rol !== 'admin') {
        return res.status(403).json({ error: 'Sin permisos de administrador' });
      }
      // Obtener último acceso de cada usuario en un solo MGET
      const lastLogins = usuarios.length > 0
        ? await redis(['MGET', ...usuarios.map(u => `lastlogin:${u.email}`)])
        : [];
      const usuariosConAcceso = usuarios.map((u, i) => ({
        ...u,
        lastlogin: lastLogins[i] || null
      }));
      return res.status(200).json({ usuarios: usuariosConAcceso });
    } catch {
      return res.status(500).json({ error: 'Error interno' });
    }
  }

  if (type === 'pendientes' || type === 'reset-pendientes') {
    const creds = parseAuth(req);
    if (!creds?.email || !creds?.token) return res.status(401).json({ error: 'No autorizado' });
    const secret = process.env.ADMIN_SECRET;
    if (!secret) return res.status(500).json({ error: 'Error interno' });
    if (!verificarToken(creds.email, creds.token, secret)) return res.status(401).json({ error: 'Token inválido' });
    const usuarios = await getUsuarios();
    const usuario  = usuarios.find(u => u.email === creds.email);
    if (!usuario || usuario.rol !== 'admin') return res.status(403).json({ error: 'Sin permisos' });

    const pendientes = parseInt(await redis(['GET', 'solicitudes:pendientes'])) || 0;
    if (type === 'reset-pendientes') await redis(['SET', 'solicitudes:pendientes', '0']);
    return res.status(200).json({ pendientes });
  }

  return res.status(404).json({ error: 'Recurso no encontrado' });
}
