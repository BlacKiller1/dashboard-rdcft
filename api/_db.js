// api/_db.js — Acceso a usuarios via Upstash Redis
// Los usuarios se guardan en la key "usuarios_db" sin TTL.
// Si la key aún no existe (primera ejecución tras la migración),
// cae al env var USUARIOS_DB como fuente de datos.

async function redis(command) {
  const res = await fetch(process.env.UPSTASH_REDIS_REST_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(command)
  });
  return (await res.json()).result;
}

export async function getUsuarios() {
  try {
    const raw = await redis(['GET', 'usuarios_db']);
    if (raw) return JSON.parse(raw).usuarios || [];
  } catch {}
  // Fallback al env var mientras no se haya hecho el primer guardado
  try {
    return JSON.parse(process.env.USUARIOS_DB || '{}').usuarios || [];
  } catch {
    return [];
  }
}

export async function setUsuarios(usuarios) {
  await redis(['SET', 'usuarios_db', JSON.stringify({ usuarios })]);
}
