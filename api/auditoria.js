// api/auditoria.js — Devuelve el registro de auditoría (solo admins)
import { setCorsHeaders, parseAuth, verificarToken, redis } from './_auth.js';
import { getUsuarios, getAuditLog } from './_db.js';

export default async function handler(req, res) {
  setCorsHeaders(req, res, 'GET, OPTIONS', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET')    return res.status(405).json({ error: 'Método no permitido' });

  const creds = parseAuth(req);
  if (!creds?.email || !creds?.token)
    return res.status(401).json({ error: 'No autorizado' });

  const secret = process.env.ADMIN_SECRET;
  if (!secret) return res.status(500).json({ error: 'Variables no configuradas' });

  if (!verificarToken(creds.email, creds.token, secret))
    return res.status(401).json({ error: 'Token inválido' });

  if (creds.sessionId) {
    try {
      const stored = await redis(['GET', `session:${creds.email}`]);
      if (!stored || stored !== creds.sessionId)
        return res.status(401).json({ error: 'Sesión inválida o expirada.' });
    } catch {}
  }

  const usuarios = await getUsuarios();
  const reqUser  = usuarios.find(u => u.email === creds.email);
  if (!reqUser || reqUser.rol !== 'admin')
    return res.status(403).json({ error: 'Sin permisos de administrador' });

  const log = await getAuditLog(200);
  return res.status(200).json({ log });
}
