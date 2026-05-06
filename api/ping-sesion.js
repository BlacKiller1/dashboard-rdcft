// api/ping-sesion.js — Verifica si el sessionId del cliente sigue activo en Redis
const ALLOWED_ORIGINS = [
  'https://arauco-rdcft.vercel.app',
  'http://localhost:5500',
  'http://127.0.0.1:5500'
];

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

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  try {
    const parts = (req.headers.authorization || '').split(' ');
    if (parts[0] !== 'Bearer' || !parts[1]) return res.status(401).json({ valid: false });
    const { email, sessionId } = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    if (!email || !sessionId) return res.status(401).json({ valid: false });

    const stored = await redis(['GET', `session:${email}`]);
    if (!stored || stored !== sessionId) {
      return res.status(401).json({ valid: false });
    }
    return res.status(200).json({ valid: true });
  } catch {
    return res.status(500).json({ valid: false });
  }
}
