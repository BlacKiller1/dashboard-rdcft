// api/usuarios.js — Actualizar usuarios y redesplegar Vercel automáticamente
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://arauco-rdcft.vercel.app');

  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const { usuarios } = req.body;
  if (!usuarios) return res.status(400).json({ error: 'Datos inválidos' });

  const VERCEL_TOKEN  = process.env.VERCEL_TOKEN;
  const PROJECT_ID    = process.env.VERCEL_PROJECT_ID;

  if (!VERCEL_TOKEN || !PROJECT_ID) {
    return res.status(500).json({ error: 'Variables de Vercel no configuradas' });
  }

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
        gitSource: {
          type: 'github',
          repoId: PROJECT_ID,
          ref: 'main'
        },
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