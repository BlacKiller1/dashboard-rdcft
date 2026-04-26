// api/usuarios.js — Actualizar usuarios (requiere sesión de admin firmada)
import crypto from 'crypto';

const ALLOWED_ORIGINS = [
  'https://arauco-rdcft.vercel.app',
  'http://localhost:5500',
  'http://127.0.0.1:5500'
];

function parseAuth(req) {
  try {
    const parts = (req.headers.authorization || '').split(' ');
    if (parts[0] !== 'Bearer' || !parts[1]) return null;
    return JSON.parse(Buffer.from(parts[1], 'base64').toString());
  } catch { return null; }
}

function verificarToken(email, token, secret) {
  try {
    const hoy  = new Date().toISOString().slice(0, 10);
    const ayer = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    for (const fecha of [hoy, ayer]) {
      const expected = crypto.createHmac('sha256', secret).update(`${email}:${fecha}`).digest('hex');
      if (token.length === expected.length &&
          crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))) return true;
    }
    return false;
  } catch { return false; }
}

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  // ── Autenticación ──────────────────────────────────────────────────────────
  const creds = parseAuth(req);
  if (!creds?.email || !creds?.token) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const secret       = process.env.ADMIN_SECRET;
  const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
  const PROJECT_ID   = process.env.VERCEL_PROJECT_ID;

  if (!secret || !VERCEL_TOKEN || !PROJECT_ID) {
    return res.status(500).json({ error: 'Variables no configuradas' });
  }

  if (!verificarToken(creds.email, creds.token, secret)) {
    return res.status(401).json({ error: 'Token inválido' });
  }

  // Verificar rol admin en la BD actual
  let existingUsuarios = [];
  try { existingUsuarios = JSON.parse(process.env.USUARIOS_DB || '{}').usuarios || []; } catch {}
  const requestUser = existingUsuarios.find(u => u.email === creds.email);
  if (!requestUser || requestUser.rol !== 'admin') {
    return res.status(403).json({ error: 'Sin permisos de administrador' });
  }

  // ── Validar payload ────────────────────────────────────────────────────────
  const { usuarios } = req.body || {};
  if (!Array.isArray(usuarios)) return res.status(400).json({ error: 'Datos inválidos' });

  try {
    const nuevoValor = JSON.stringify({ usuarios });

    // Paso 1 — Obtener ID de la variable USUARIOS_DB
    const envResp = await fetch(`https://api.vercel.com/v10/projects/${PROJECT_ID}/env`, {
      headers: { 'Authorization': `Bearer ${VERCEL_TOKEN}` }
    });
    const envData = await envResp.json();
    const envVar  = envData.envs?.find(e => e.key === 'USUARIOS_DB');

    if (envVar) {
      // Paso 2 — Actualizar variable existente
      const patchResp = await fetch(`https://api.vercel.com/v10/projects/${PROJECT_ID}/env/${envVar.id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${VERCEL_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ value: nuevoValor, target: ['production'] })
      });
      if (!patchResp.ok) throw new Error(`Vercel PATCH: ${patchResp.status}`);
    } else {
      // Paso 2b — Crear variable si no existe
      const postResp = await fetch(`https://api.vercel.com/v10/projects/${PROJECT_ID}/env`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VERCEL_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          key: 'USUARIOS_DB',
          value: nuevoValor,
          type: 'encrypted',
          target: ['production']
        })
      });
      if (!postResp.ok) throw new Error(`Vercel POST: ${postResp.status}`);
    }

    // Paso 3 — Redesplegar automáticamente
    const deployResp = await fetch(`https://api.vercel.com/v13/deployments`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${VERCEL_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'dashboard-rdcft',
        gitSource: { type: 'github', repoId: PROJECT_ID, ref: 'main' },
        projectId: PROJECT_ID,
        target: 'production'
      })
    });

    const deployData = await deployResp.json();
    console.log('[RDCFT] Redespliegue iniciado:', deployData.id || deployData);

    return res.status(200).json({
      ok: true,
      total: usuarios.length,
      mensaje: 'Usuarios actualizados. El sistema se actualizará en ~1 minuto.'
    });

  } catch (err) {
    console.error('[RDCFT] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
