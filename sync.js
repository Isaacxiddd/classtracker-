import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config';
import * as db from './db';

let supabase = null;
let connected = false;

export function initSync() {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });
    connected = true;
    return true;
  } catch {
    connected = false;
    return false;
  }
}

export function isSyncConnected() {
  return connected;
}

async function pushMateriasToClasses() {
  const materias = await db.getAllSync('materias');
  let count = 0;

  const { data: existingClasses } = await supabase.from('classes').select('id,name');
  const classByName = {};
  const usedIds = new Set();
  if (existingClasses) {
    existingClasses.forEach(c => {
      classByName[c.name] = c.id;
      usedIds.add(c.id);
    });
  }

  let nextId = Math.max(...usedIds, 0) + 1;

  for (const m of materias) {
    const payload = {
      name: m.nombre,
      emoji: m.emoji || '',
      day_of_week: m.dia,
      start_time: m.horaInicio,
      end_time: m.horaFin,
      location: m.ubicacion || '',
      updated_at: new Date().toISOString(),
    };

    const existingId = classByName[m.nombre];
    if (existingId) {
      const { error } = await supabase.from('classes').update(payload).eq('id', existingId);
      if (!error) count++;
    } else {
      payload.id = nextId++;
      const { error } = await supabase.from('classes').insert(payload);
      if (!error) count++;
    }
  }
  return count;
}

async function pullClassesToMaterias() {
  const { data: classes } = await supabase.from('classes').select('*').order('id');
  if (!classes) return 0;

  let count = 0;
  for (const c of classes) {
    const existing = await db.getFirstSync('materias', { nombre: c.name });
    if (existing) {
      await db.updateSync('materias', existing.id, {
        emoji: c.emoji,
        dia: c.day_of_week,
        horaInicio: c.start_time,
        horaFin: c.end_time,
        ubicacion: c.location || '',
      });
      count++;
    }
  }
  return count;
}

async function pushLogsToSurveys() {
  const logs = await db.getAllSync('logs');
  if (logs.length === 0) return 0;

  const { data: remoteClasses } = await supabase.from('classes').select('id,name');
  const classByName = {};
  if (remoteClasses) remoteClasses.forEach(c => classByName[c.name] = c.id);

  const materias = await db.getAllSync('materias');
  const materiaById = {};
  materias.forEach(m => materiaById[m.id] = m);

  const { data: existingSurveys } = await supabase.from('surveys').select('id,class_id,date,rating');
  const usedIds = new Set();
  const surveyByClassDate = {};
  if (existingSurveys) {
    existingSurveys.forEach(s => {
      usedIds.add(s.id);
      surveyByClassDate[`${s.class_id}|${s.date}`] = s;
    });
  }
  let nextId = Math.max(...usedIds, 0) + 1;

  let count = 0;
  for (const log of logs) {
    const materia = materiaById[log.materiaId];
    if (!materia) continue;

    const classId = classByName[materia.nombre];
    if (!classId) continue;

    const extra = {
      ejercicios: log.ejercicios || '',
      tiempo: log.tiempo || '',
      tema: log.tema || '',
      energia: log.energia ?? 3,
      distraccion: log.distraccion ?? 3,
    };

    const existing = surveyByClassDate[`${classId}|${log.fecha}`];

    const payload = {
      class_id: classId,
      date: log.fecha,
      rating: existing?.rating ?? 3,
      notes: log.nota || '',
      extra,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (existing) {
      const { error } = await supabase.from('surveys').update(payload).eq('id', existing.id);
      if (!error) count++;
    } else {
      payload.id = nextId++;
      const { error } = await supabase.from('surveys').insert(payload);
      if (!error) count++;
    }
  }
  return count;
}

async function pullSurveysToLogs() {
  const { data: surveys } = await supabase.from('surveys').select('*');
  if (!surveys) return 0;

  const { data: remoteClasses } = await supabase.from('classes').select('id,name');
  const classById = {};
  if (remoteClasses) remoteClasses.forEach(c => classById[c.id] = c);

  const materias = await db.getAllSync('materias');
  const materiaByName = {};
  materias.forEach(m => materiaByName[m.nombre] = m);

  let count = 0;
  for (const s of surveys) {
    const cls = classById[s.class_id];
    if (!cls) continue;
    const materia = materiaByName[cls.name];
    if (!materia) continue;

    const extra = s.extra || {};
    const logData = {
      materiaId: materia.id,
      fecha: s.date,
      ejercicios: extra.ejercicios || '',
      tiempo: extra.tiempo || '',
      tema: extra.tema || '',
      energia: extra.energia ?? 3,
      distraccion: extra.distraccion ?? 3,
      nota: s.notes || '',
    };

    const existing = await db.getFirstSync('logs', { materiaId: materia.id, fecha: s.date });
    if (existing) {
      await db.updateSync('logs', existing.id, logData);
    } else {
      await db.addSync('logs', logData);
    }
    count++;
  }
  return count;
}

export async function fullSync(onProgress) {
  if (!connected || !supabase) return { ok: false, error: 'No conectado' };

  try {
    onProgress?.('Subiendo materias...');
    const pushedMaterias = await pushMateriasToClasses();

    onProgress?.('Subiendo registros diarios...');
    const pushedLogs = await pushLogsToSurveys();

    onProgress?.('Descargando clases...');
    const pulledClasses = await pullClassesToMaterias();

    onProgress?.('Descargando registros...');
    const pulledSurveys = await pullSurveysToLogs();

    return {
      ok: true,
      pushed: pushedMaterias + pushedLogs,
      pulled: pulledClasses + pulledSurveys,
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
