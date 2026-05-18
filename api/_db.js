// api/_db.js — Acceso a usuarios y auditoría via Upstash Redis
import { redis } from './_auth.js';

const AUDIT_KEY      = 'audit_log';
const AUDIT_MAX_ROWS = 500;

export async function getUsuarios() {
  try {
    const raw = await redis(['GET', 'usuarios_db']);
    if (raw) return JSON.parse(raw).usuarios || [];
  } catch {}
  try {
    return JSON.parse(process.env.USUARIOS_DB || '{}').usuarios || [];
  } catch {
    return [];
  }
}

export async function setUsuarios(usuarios) {
  await redis(['SET', 'usuarios_db', JSON.stringify({ usuarios })]);
}

export async function pushAuditLog(entry) {
  const row = JSON.stringify({ ...entry, fecha: new Date().toISOString() });
  await redis(['LPUSH', AUDIT_KEY, row]);
  await redis(['LTRIM', AUDIT_KEY, 0, AUDIT_MAX_ROWS - 1]);
}

export async function getAuditLog(limit = 100) {
  try {
    const rows = await redis(['LRANGE', AUDIT_KEY, 0, limit - 1]);
    return (rows || []).map(r => JSON.parse(r));
  } catch {
    return [];
  }
}
