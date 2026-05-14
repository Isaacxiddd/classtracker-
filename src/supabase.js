import { createClient } from '@supabase/supabase-js';

const URL = import.meta.env.VITE_SUPABASE_URL || '';
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

let client = null;
let _connected = false;

export function isConnected() {
  return _connected;
}

export function initSupabase() {
  if (!URL || !ANON_KEY) {
    _connected = false;
    client = null;
    return false;
  }
  try {
    client = createClient(URL, ANON_KEY);
    _connected = true;
    return true;
  } catch {
    _connected = false;
    client = null;
    return false;
  }
}

const T = {
  classes: 'classes',
  surveys: 'surveys',
  blocks: 'blocks',
  blockLogs: 'block_logs',
  exams: 'exams',
  config: 'config',
  summaries: 'summaries',
  topics: 'topics',
  topicLogs: 'topic_logs',
};

const C = {
  classId: 'class_id',
  blockId: 'block_id',
  topicId: 'topic_id',
  dayOfWeek: 'day_of_week',
  startTime: 'start_time',
  endTime: 'end_time',
  weekStart: 'week_start',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
};

const C_REV = {};
for (const [k, v] of Object.entries(C)) C_REV[v] = k;

function toRemote(rec) {
  const r = {};
  for (const [k, v] of Object.entries(rec)) {
    if (k === 'id') { r.id = v; continue; }
    r[C[k] || k] = v;
  }
  delete r.updatedAt;
  r.updated_at = new Date().toISOString();
  if (r.extra && typeof r.extra === 'object') r.extra = JSON.stringify(r.extra);
  if (r.value && typeof r.value === 'object') r.value = JSON.stringify(r.value);
  return r;
}

function toLocal(rec) {
  const r = {};
  for (const [k, v] of Object.entries(rec)) {
    if (k === 'id') { r.id = v; continue; }
    r[C_REV[k] || k] = v;
  }
  if (r.extra && typeof r.extra === 'string') {
    try { r.extra = JSON.parse(r.extra); } catch { r.extra = {}; }
  }
  if (r.value && typeof r.value === 'string') {
    try { r.value = JSON.parse(r.value); } catch { r.value = {}; }
  }
  return r;
}

export async function pushTable(db, tableName) {
  if (!_connected || !client) return { ok: false, error: 'No conectado' };
  const supTable = T[tableName];
  if (!supTable) return { ok: false, error: 'Tabla desconocida' };

  const lastSync = await db.config.get({ key: 'lastSync' });
  const since = lastSync?.value || 0;

  let records;
  try {
    records = since > 0
      ? await db[tableName].where('updatedAt').above(since).toArray()
      : await db[tableName].toArray();
  } catch {
    records = await db[tableName].toArray();
  }

  if (records.length === 0) return { ok: true, count: 0 };

  const batch = records.map(toRemote);
  const { error } = await client.from(supTable).upsert(batch, { onConflict: 'id' });
  if (error) return { ok: false, error: error.message };

  const existingSync = await db.config.get({ key: 'lastSync' });
  await db.config.put({ id: existingSync?.id, key: 'lastSync', value: Date.now(), updatedAt: Date.now() });
  return { ok: true, count: records.length };
}

export async function pushAll(db) {
  const tables = Object.keys(T);
  let total = 0, errors = [];
  for (const t of tables) {
    const r = await pushTable(db, t);
    if (r.ok) total += r.count;
    else errors.push(`${t}: ${r.error}`);
  }
  return { ok: errors.length === 0, total, errors };
}

export async function pullTable(db, tableName) {
  if (!_connected || !client) return { ok: false, error: 'No conectado', records: [] };
  const supTable = T[tableName];
  if (!supTable) return { ok: false, error: 'Tabla desconocida', records: [] };

  const lastSync = await db.config.get({ key: 'lastSync' });
  const since = lastSync?.value || 0;

  let query = client.from(supTable).select('*');
  if (since > 0) {
    query = query.gt('updated_at', new Date(since).toISOString());
  }

  const { data, error } = await query.order('id');
  if (error) return { ok: false, error: error.message, records: [] };

  return { ok: true, records: (data || []).map(toLocal) };
}

export async function pullAll(db) {
  const tables = Object.keys(T);
  let total = 0, errors = [];
  for (const t of tables) {
    const r = await pullTable(db, t);
    if (!r.ok) { errors.push(`${t}: ${r.error}`); continue; }
    for (const rec of r.records) {
      try {
        await db[t].put(rec);
      } catch { }
    }
    total += r.records.length;
  }
  return { ok: errors.length === 0, total, errors };
}

export async function fullSync(db, onProgress) {
  if (!_connected || !client) return { ok: false, error: 'No conectado' };

  onProgress?.('Subiendo datos locales...');
  const push = await pushAll(db);

  onProgress?.(`${push.total} registros subidos. Descargando cambios remotos...`);
  const pull = await pullAll(db);

  const existingSync = await db.config.get({ key: 'lastSync' });
  await db.config.put({ id: existingSync?.id, key: 'lastSync', value: Date.now(), updatedAt: Date.now() });
  return { ok: true, pushed: push.total, pulled: pull.total, errors: [...push.errors, ...pull.errors].filter(Boolean) };
}
