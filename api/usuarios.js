// api/usuarios.js — Actualizar usuarios en Vercel Environment Variables
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

    // Actualizar variable USUARIOS_DB en Vercel
    const resp = await fetch(`https://api.vercel.com/v10/projects/${PROJECT_ID}/env`, {
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

    if (!resp.ok) {
      // Si ya existe, actualizar con PATCH
      const envResp = await fetch(`https://api.vercel.com/v10/projects/${PROJECT_ID}/env`, {
        headers: { 'Authorization': `Bearer ${VERCEL_TOKEN}` }
      });
      const envData = await envResp.json();
      const envVar = envData.envs?.find(e => e.key === 'USUARIOS_DB');

      if (envVar) {
        const patchResp = await fetch(`https://api.vercel.com/v10/projects/${PROJECT_ID}/env/${envVar.id}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${VERCEL_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ value: nuevoValor, target: ['production'] })
        });
        if (!patchResp.ok) throw new Error(`Vercel PATCH: ${patchResp.status}`);
      }
    }

    return res.status(200).json({ ok: true, total: usuarios.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
