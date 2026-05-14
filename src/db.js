import Dexie from 'dexie';

export const db = new Dexie('ClassTrackerDB');

db.version(1).stores({
  classes: '++id, name, emoji, dayOfWeek, startTime, endTime, location',
  surveys: '++id, classId, date, rating, notes, createdAt',
  config: '++id, key',
  blocks: '++id, name, emoji, dayOfWeek, startTime, endTime',
  blockLogs: '++id, blockId, date, done, notes',
  summaries: '++id, weekStart, createdAt',
});
db.version(2).stores({
  exams: '++id, name, emoji, date, time, location, notes'
});
db.version(3).stores({
  topics: '++id, classId, name',
  topicLogs: '++id, topicId, date, count, type, notes'
});
db.version(4).stores({
  classes: '++id, name, dayOfWeek, updatedAt',
  surveys: '++id, classId, date, updatedAt',
  config: '++id, key, updatedAt',
  blocks: '++id, name, dayOfWeek, updatedAt',
  blockLogs: '++id, blockId, date, updatedAt',
  summaries: '++id, weekStart, updatedAt',
  exams: '++id, name, date, updatedAt',
  topics: '++id, classId, name, updatedAt',
  topicLogs: '++id, topicId, date, updatedAt'
});

['classes','surveys','blocks','blockLogs','exams','config','summaries','topics','topicLogs'].forEach(t => {
  db[t].hook('creating', function (_, obj) { obj.updatedAt = Date.now(); });
  db[t].hook('updating', function (mod) { mod.updatedAt = Date.now(); return mod; });
});

export const RATING = { GREEN: 3, YELLOW: 2, RED: 1 };
export const RATING_LABELS = { 3: 'Bien', 2: 'Regular', 1: 'Mal' };
export const RATING_COLORS = { 3: '#22c55e', 2: '#eab308', 1: '#ef4444' };
export const RATING_EMOJI = { 3: '🟢', 2: '🟡', 1: '🔴' };
export const RATING_ORDER = [3, 2, 1];
export const DIAS = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export function today() {
  return new Date().toLocaleDateString('es-ES');
}

export function fmtDate(d) {
  return d.toLocaleDateString('es-ES');
}

export function getMonday(ref) {
  const d = new Date(ref);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0,0,0,0);
  return d;
}

export function addWeeks(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n * 7);
  return r;
}

export function isToday(dateStr) {
  return dateStr === today();
}

export function isFuture(dateStr) {
  const p = dateStr.split('/');
  const d = new Date(+p[2], +p[1] - 1, +p[0]);
  const now = new Date();
  now.setHours(0,0,0,0);
  return d > now;
}

function getDateForWeekday(monday, dayOfWeek) {
  const d = new Date(monday);
  d.setDate(d.getDate() + dayOfWeek - 1);
  return d;
}

export function getMonthLabel() {
  return new Date().toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
}

export async function getConfig(key, defaults) {
  let cfg = await db.config.get({ key });
  if (!cfg) {
    cfg = { id: undefined, key, ...defaults };
    await db.config.add(cfg);
  }
  return cfg;
}

export async function saveConfig(cfg) {
  cfg.updatedAt = Date.now();
  await db.config.put(cfg);
}

export function getCurrentClass(classes) {
  const now = new Date();
  const diaActual = now.getDay();
  const minutosActual = now.getHours() * 60 + now.getMinutes();
  return classes.find(c => {
    if (c.dayOfWeek !== diaActual) return false;
    const [hi, mi] = c.startTime.split(':').map(Number);
    const [hf, mf] = c.endTime.split(':').map(Number);
    return minutosActual >= (hi * 60 + mi) && minutosActual <= (hf * 60 + mf);
  }) || null;
}

export function getClassesForPeriod(classes, surveys, blocks, blockLogs, monday) {
  const weekDays = [1, 2, 3, 4, 5, 6, 7];
  return weekDays.map(dayNum => {
    const dateObj = getDateForWeekday(monday, dayNum);
    const dateStr = fmtDate(dateObj);
    const todayStr = today();
    const isTodayDate = dateStr === todayStr;
    const isFutureDate = isFuture(dateStr);
    return {
      dayNum,
      dateObj,
      dateStr,
      isToday: isTodayDate,
      isFuture: isFutureDate,
      classes: classes.filter(c => c.dayOfWeek === dayNum).map(c => ({
        ...c,
        survey: surveys?.find(s => s.classId === c.id && s.date === dateStr) || null
      })),
      blocks: blocks.filter(b => b.dayOfWeek === dayNum).map(b => ({
        ...b,
        log: blockLogs?.find(l => l.blockId === b.id && l.date === dateStr) || null
      }))
    };
  });
}

export function getClassesJustEnded(classes, surveys) {
  const now = Date.now();
  const todayStr = today();
  return classes.filter(c => {
    if (surveys?.find(s => s.classId === c.id && s.date === todayStr)) return false;
    const [hf, mf] = c.endTime.split(':').map(Number);
    const end = new Date();
    end.setHours(hf, mf, 0, 0);
    const diff = now - end.getTime();
    return diff >= 0 && diff < 120000;
  });
}

export function getDayColor(dayClasses) {
  const ratings = dayClasses.map(c => c.survey?.rating).filter(Boolean);
  if (ratings.length === 0) return null;
  if (ratings.some(r => r === 1)) return 1;
  if (ratings.every(r => r === 3)) return 3;
  return 2;
}

export async function toggleBlockDone(blockId, done, dateStr) {
  const existing = await db.blockLogs.where({ blockId, date: dateStr }).first();
  if (existing) {
    await db.blockLogs.update(existing.id, { done });
  } else {
    await db.blockLogs.add({ blockId, date: dateStr, done, notes: '' });
  }
}

export const DEFAULT_CLASS_SURVEY_CONFIG = {
  notesEnabled: true,
  customFields: [
    { id: 'comprension', label: 'Comprensión (1-5)', type: 'rating' },
    { id: 'riesgo', label: 'Riesgo acumulación', type: 'select', options: ['Bajo', 'Medio', 'Alto'] },
    { id: 'prioridad', label: '¿Revisar en 48h?', type: 'boolean' },
    { id: 'tema', label: 'Tema de clase', type: 'text' },
    { id: 'fatiga', label: 'Fatiga (1-5)', type: 'rating' }
  ]
};

export const DEFAULT_BLOCK_SURVEY_CONFIG = {
  notesEnabled: true,
  customFields: [
    { id: 'tipo', label: 'Tipo de sesión', type: 'select', options: ['Ejercicios', 'Teoría', 'Repaso', 'Parcial', 'Debugging', 'Lectura'] },
    { id: 'intentados', label: 'Ejers. intentados', type: 'number' },
    { id: 'resueltos', label: 'Ejers. resueltos', type: 'number' },
    { id: 'sin_ayuda', label: 'Resueltos sin ayuda', type: 'number' },
    { id: 'recuperacion', label: 'Recuperación (1-5)', type: 'rating' },
    { id: 'friccion', label: 'Fricción arranque (1-5)', type: 'rating' },
    { id: 'claridad', label: 'Claridad post-sesión', type: 'select', options: ['Sí', 'Parcial', 'No'] },
    { id: 'prox_accion', label: 'Próxima acción', type: 'text' }
  ]
};

const GEMINI_HEADER = `📅 CONTEXTO SEMANAL — {WEEK}\n\n== CLASES ==`;
const GEMINI_DAY = `\n📆 {DAY_NAME} {DAY_DATE}\n{CLASSES}{BLOCKS}`;
const GEMINI_FOOTER = `\n\n== MÉTRICAS ==\nPromedio: {AVG}/3 · Cubiertas: {DONE}/{TOTAL}`;

export const DEFAULT_TEMPLATES = {
  headerTemplate: GEMINI_HEADER,
  dayTemplate: GEMINI_DAY,
  footerTemplate: GEMINI_FOOTER
};

export async function getOutputTemplate() {
  return getConfig('outputTemplate', DEFAULT_TEMPLATES);
}

export async function saveBlockSurvey(blockId, dateStr, extra, notes) {
  const existing = await db.blockLogs.where({ blockId, date: dateStr }).first();
  if (existing) {
    await db.blockLogs.update(existing.id, { extra, notes });
  } else {
    await db.blockLogs.add({ blockId, date: dateStr, done: true, extra, notes });
  }
}

function fillClass(c, s) {
  if (!s) return '';
  let r = `  ${c.emoji} ${c.name} (${c.startTime}-${c.endTime})\n  → ${RATING_LABELS[s.rating]} ${RATING_EMOJI[s.rating]}`;
  if (s.extra) {
    Object.entries(s.extra).forEach(([k, v]) => {
      if (v !== '' && v !== undefined && v !== null) r += `\n    • ${k}: ${v}`;
    });
  }
  if (s.notes) r += `\n    📝 ${s.notes}`;
  return r;
}

function fillBlock(b, log) {
  const done = log?.done ? '✅' : '⬜';
  let r = `  ${b.emoji} ${b.name} ${done}`;
  if (log?.extra) {
    Object.entries(log.extra).forEach(([k, v]) => {
      if (v !== '' && v !== undefined && v !== null) r += `\n    • ${k}: ${v}`;
    });
  }
  if (log?.notes) r += `\n    📝 ${log.notes}`;
  return r;
}

export function parseISODate(s) {
  if (!s) return null;
  const [y, m, d] = s.split('-');
  return new Date(+y, +m - 1, +d);
}

function dateStrToDate(s) {
  const p = s.split('/');
  return new Date(+p[2], +p[1] - 1, +p[0]);
}

function daysBetween(a, b) {
  return Math.floor((b.getTime() - a.getTime()) / 86400000);
}

export function getDaysSinceLastContact(classes, surveys, blocks, blockLogs) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return classes.map(c => {
    const classSurveys = surveys?.filter(s => s.classId === c.id) || [];
    const surveyDates = classSurveys.map(s => dateStrToDate(s.date));
    const blockDates = (blocks || []).filter(b => (b.subjects || '').split('|').includes(c.name))
      .flatMap(b => (blockLogs || []).filter(l => l.blockId === b.id && l.done).map(l => dateStrToDate(l.date)));
    const allDates = [...surveyDates, ...blockDates];
    const lastDate = allDates.length ? allDates.sort((a, b) => b - a)[0] : null;
    return {
      class: c,
      daysSince: lastDate ? daysBetween(lastDate, now) : null,
      lastDate,
    };
  }).sort((a, b) => {
    if (a.daysSince === null) return -1;
    if (b.daysSince === null) return 1;
    return b.daysSince - a.daysSince;
  });
}

export function getMonthMetrics(classes, surveys, blocks, blockLogs) {
  const month = new Date().getMonth();
  const year = new Date().getFullYear();
  const surveysThisMonth = surveys?.filter(s => {
    const p = s.date.split('/');
    const d = new Date(+p[2], +p[1] - 1, +p[0]);
    return d.getMonth() === month && d.getFullYear() === year;
  }) || [];
  const ratings = { 3: 0, 2: 0, 1: 0 };
  surveysThisMonth.forEach(s => ratings[s.rating]++);
  const totalClasses = classes.length * 4;
  const totalDone = surveysThisMonth.length;
  const blockLogsThisMonth = blockLogs?.filter(l => {
    const p = l.date.split('/');
    const d = new Date(+p[2], +p[1] - 1, +p[0]);
    return d.getMonth() === month && d.getFullYear() === year;
  }) || [];
  return { totalClasses, totalDone, ratings, surveysThisMonth, blockLogsThisMonth };
}

export function generateGeminiPrompt(classes, surveys, blocks, blockLogs, exams) {
  const now = new Date();
  const contactData = getDaysSinceLastContact(classes, surveys, blocks, blockLogs);

  let r = `📅 CONTEXTO PARA GENERAR HORARIO SEMANAL
Fecha: ${now.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}

== HORARIO FIJO DE CURSADA ==`;
  const schedule = {1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: []};
  classes.forEach(c => schedule[c.dayOfWeek]?.push(`${c.name} (${c.startTime}-${c.endTime})`));
  DIAS.forEach((d, i) => {
    if (i && schedule[i]?.length) r += `\n${d}: ${schedule[i].join(', ')}`;
  });

  r += `\n\n== ESTADO POR MATERIA ==`;
  contactData.forEach(({ class: c, daysSince }) => {
    const last = surveys?.filter(s => s.classId === c.id).sort((a, b) => b.createdAt?.localeCompare(a.createdAt))[0];
    r += `\n\n${c.emoji} ${c.name}`;
    r += `\n  Último contacto: ${daysSince === null ? 'Nunca' : daysSince + ' días'}`;
    if (last) {
      r += `\n  Rating: ${RATING_LABELS[last.rating]} ${RATING_EMOJI[last.rating]}`;
      if (last.extra) Object.entries(last.extra).forEach(([k, v]) => { if (v) r += `\n  ${k}: ${v}`; });
      if (last.notes) r += `\n  Notas: ${last.notes}`;
    }
  });

  if (blocks?.length) {
    r += `\n\n== BLOQUES DE ESTUDIO ==`;
    blocks.forEach(b => {
      const lastLog = blockLogs?.filter(l => l.blockId === b.id).sort((x, y) => dateStrToDate(y.date) - dateStrToDate(x.date))[0];
      r += `\n\n${b.emoji} ${b.name} (${DIAS[b.dayOfWeek]} ${b.startTime}-${b.endTime})`;
      if (lastLog) {
        if (lastLog.done) r += `\n  Completado: ✅`;
        if (lastLog.extra) Object.entries(lastLog.extra).forEach(([k, v]) => { if (v) r += `\n  ${k}: ${v}`; });
        if (lastLog.notes) r += `\n  Notas: ${lastLog.notes}`;
      }
    });
  }

  const upcoming = exams?.filter(e => parseISODate(e.date) >= now).sort((a, b) => parseISODate(a.date) - parseISODate(b.date)) || [];
  if (upcoming.length) {
    r += `\n\n== EXÁMENES PRÓXIMOS ==`;
    upcoming.forEach(e => r += `\n${fmtDate(parseISODate(e.date))} — ${e.emoji || '📝'} ${e.name}${e.time ? ' ' + e.time : ''}`);
  }

  r += `\n\n== REGLAS ==
1. Priorizar: parcial cercano > rojo > acumulatividad > días sin tocar
2. Máximo 2 materias pesadas por día
3. Contacto mínimo semanal para toda materia
4. Si clase sale mal → revisión mismo día o al siguiente
5. Domingo: materia más atrasada
6. Algoritmos y Lógica: casi todos los días
7. Física: bloque fuerte + dudas para el particular
8. SPN: solo repaso espaciado con apuntes
9. Álgebra y Lógica: comprensión conceptual (hoja de fórmulas)
10. Bloques concretos y ejecutables

== GENERAR ==
Horario semanal con:
- Día | Horario | Materia | Tipo (ejercicios/teoría/repaso/simulacro/recuperación/particular) | Prioridad | Reemplazo si se cae`;

  return r;
}

export function generateWeekSummary(classes, surveys, blocks, blockLogs, template) {
  const t = template || DEFAULT_TEMPLATES;
  const weekDays = [1, 2, 3, 4, 5, 6, 7];
  const monday = getMonday(new Date());
  let totalDone = 0, totalAll = 0, sumRating = 0, daysOutput = '';

  weekDays.forEach(d => {
    const dayClasses = classes.filter(c => c.dayOfWeek === d);
    const dayBlocks = blocks.filter(b => b.dayOfWeek === d);
    if (dayClasses.length === 0 && dayBlocks.length === 0) return;
    let dayDone = 0, dayTotal = 0, classesText = '', blocksText = '';
    const dateObj = getDateForWeekday(monday, d);
    const dateStr = fmtDate(dateObj);

    dayClasses.forEach(c => {
      dayTotal++; totalAll++;
      const s = surveys?.find(sv => sv.classId === c.id && sv.date === dateStr);
      const line = fillClass(c, s);
      if (line) { classesText += line + '\n'; dayDone++; totalDone++; sumRating += s.rating; }
    });
    dayBlocks.forEach(b => {
      const log = blockLogs?.find(l => l.blockId === b.id && l.date === dateStr);
      blocksText += fillBlock(b, log) + '\n';
    });

    daysOutput += t.dayTemplate
      .replace(/{DAY_NAME}/g, DIAS[d])
      .replace(/{DAY_DATE}/g, dateObj.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }))
      .replace(/{CLASSES}/g, classesText.trimEnd() + '\n')
      .replace(/{BLOCKS}/g, blocksText.trimEnd() + '\n')
      .replace(/{DAY_DONE}/g, dayDone)
      .replace(/{DAY_TOTAL}/g, dayTotal);
  });

  const avg = totalDone > 0 ? (sumRating / totalDone).toFixed(1) : '-';
  return (t.headerTemplate.replace(/{WEEK}/g, getMonday(new Date()).toLocaleDateString('es-ES')) +
    daysOutput +
    t.footerTemplate.replace(/{DONE}/g, totalDone).replace(/{TOTAL}/g, totalAll).replace(/{AVG}/g, avg)).trim();
}

const SEED_CLASSES = [
  { name: 'Análisis Matemático I', emoji: '📐', dayOfWeek: 1, startTime: '08:30', endTime: '12:30', location: '' },
  { name: 'Física I', emoji: '⚛️', dayOfWeek: 2, startTime: '14:00', endTime: '17:00', location: 'Particular Lugano' },
  { name: 'Álgebra y Geometría Analítica', emoji: '📏', dayOfWeek: 3, startTime: '08:30', endTime: '12:30', location: '' },
  { name: 'Lógica y Estructuras Discretas', emoji: '🧠', dayOfWeek: 4, startTime: '08:30', endTime: '10:15', location: '' },
  { name: 'Sistemas y Procesos de Negocio', emoji: '💼', dayOfWeek: 4, startTime: '10:30', endTime: '12:30', location: '' },
  { name: 'Algoritmos y Estructura de Datos', emoji: '💻', dayOfWeek: 5, startTime: '08:30', endTime: '12:30', location: '' },
  { name: 'Arquitectura de Computadores', emoji: '🖥️', dayOfWeek: 6, startTime: '08:30', endTime: '12:30', location: '' },
];

const SEED_BLOCKS = [
  { name: 'Deep work AM1 + Álgebra', emoji: '📚', dayOfWeek: 1, startTime: '14:00', endTime: '17:00', subjects: 'Análisis Matemático I|Álgebra y Geometría Analítica' },
  { name: 'Repaso activo', emoji: '🔄', dayOfWeek: 1, startTime: '18:00', endTime: '20:00', subjects: '' },
  { name: 'Deep work Lógica / Algoritmos', emoji: '📚', dayOfWeek: 2, startTime: '09:00', endTime: '12:00', subjects: 'Lógica y Estructuras Discretas|Algoritmos y Estructura de Datos' },
  { name: 'Física ejercicios + dudas', emoji: '⚛️', dayOfWeek: 2, startTime: '18:00', endTime: '20:00', subjects: 'Física I' },
  { name: 'Física I (particular)', emoji: '⚛️', dayOfWeek: 3, startTime: '14:00', endTime: '20:00', subjects: 'Física I' },
  { name: 'Repaso liviano Álgebra', emoji: '📏', dayOfWeek: 3, startTime: '20:30', endTime: '21:30', subjects: 'Álgebra y Geometría Analítica' },
  { name: 'Deep work Lógica ejercicios', emoji: '📚', dayOfWeek: 4, startTime: '14:00', endTime: '17:00', subjects: 'Lógica y Estructuras Discretas' },
  { name: 'SPN repaso espaciado', emoji: '💼', dayOfWeek: 4, startTime: '18:00', endTime: '20:00', subjects: 'Sistemas y Procesos de Negocio' },
  { name: 'Física I (particular)', emoji: '⚛️', dayOfWeek: 5, startTime: '14:00', endTime: '20:00', subjects: 'Física I' },
  { name: 'C++ práctica corta', emoji: '💻', dayOfWeek: 5, startTime: '20:30', endTime: '21:30', subjects: 'Algoritmos y Estructura de Datos' },
  { name: 'Deep work Algoritmos + C++', emoji: '💻', dayOfWeek: 6, startTime: '14:00', endTime: '17:00', subjects: 'Algoritmos y Estructura de Datos' },
  { name: 'Repaso general semanal', emoji: '🔄', dayOfWeek: 6, startTime: '18:00', endTime: '20:00', subjects: '' },
  { name: 'Revisión semanal', emoji: '📋', dayOfWeek: 7, startTime: '10:00', endTime: '13:00', subjects: '' },
  { name: 'Ejercicios débiles AM1/Física', emoji: '⚛️', dayOfWeek: 7, startTime: '15:00', endTime: '17:00', subjects: 'Análisis Matemático I|Física I' },
  { name: 'Planificación semana siguiente', emoji: '📅', dayOfWeek: 7, startTime: '18:00', endTime: '19:00', subjects: '' },
];

const SEED_TOPICS_BY_CLASS = {
  'Análisis Matemático I': ['Límites', 'Continuidad', 'Derivabilidad', 'Topología'],
  'Álgebra y Geometría Analítica': ['Recta y plano', 'Subespacios', 'Vectores'],
  'Lógica y Estructuras Discretas': ['Equivalencias lógicas', 'Deducción natural', 'Álgebra de Boole'],
  'Algoritmos y Estructura de Datos': ['Tipos abstractos', 'Listas', 'Recursión', 'Ordenamiento'],
  'Física I': ['Cinemática', 'Dinámica', 'Trabajo y energía'],
  'Arquitectura de Computadores': ['Compuertas', 'Memorias', 'Pipeline'],
  'Sistemas y Procesos de Negocio': ['Procesos', 'Diagramas de flujo', 'Casos de uso'],
};

export async function getTopicsForClass(classId) {
  return db.topics.where({ classId }).toArray();
}

export async function getTopicLogsForTopic(topicId) {
  return db.topicLogs.where({ topicId }).toArray();
}

export async function getTopicStats(classId) {
  const topics = await db.topics.where({ classId }).toArray();
  const allLogs = await db.topicLogs.toArray();
  return topics.map(t => {
    const logs = allLogs.filter(l => l.topicId === t.id);
    return { ...t, logs, totalCount: logs.reduce((s, l) => s + (l.count || 0), 0) };
  });
}

const SEED_EXAMS = [
  { name: '1° Parcial SPN', emoji: '💼', date: '2026-06-25', time: '', location: '', notes: '', className: 'Sistemas y Procesos de Negocio' },
  { name: '1° Parcial Lógica', emoji: '🧠', date: '2026-07-02', time: '', location: '', notes: '', className: 'Lógica y Estructuras Discretas' },
  { name: '1° Parcial Álgebra', emoji: '📏', date: '2026-07-27', time: '', location: '', notes: 'Primer día después de vacaciones de invierno', className: 'Álgebra y Geometría Analítica' },
  { name: 'Parcial Arquitectura', emoji: '🖥️', date: '2026-07-27', time: '', location: '', notes: 'Primer día después de vacaciones de invierno', className: 'Arquitectura de Computadores' },
  { name: '2° Parcial SPN', emoji: '💼', date: '2026-11-12', time: '', location: '', notes: '', className: 'Sistemas y Procesos de Negocio' },
  { name: '2° Parcial Álgebra', emoji: '📏', date: '2026-11-18', time: '', location: '', notes: '', className: 'Álgebra y Geometría Analítica' },
];

export async function seedIfEmpty() {
  const classCount = await db.classes.count();
  if (classCount > 0) {
    const blockCount = await db.blocks.count();
    if (blockCount > 0) {
      const first = await db.blocks.toCollection().first();
      if (first && !first.subjects) {
        const seedMap = {};
        SEED_BLOCKS.forEach(b => { seedMap[b.name] = b.subjects || ''; });
        for (const b of await db.blocks.toArray()) {
          if (seedMap[b.name] !== undefined) {
            await db.blocks.update(b.id, { subjects: seedMap[b.name] });
          }
        }
      }
    }
    const topicCount = await db.topics.count();
    if (topicCount === 0) {
      const allClasses = await db.classes.toArray();
      for (const c of allClasses) {
        const seedTopics = SEED_TOPICS_BY_CLASS[c.name];
        if (seedTopics) {
          for (const t of seedTopics) {
            await db.topics.add({ classId: c.id, name: t });
          }
        }
      }
    }
    const allClasses = await db.classes.toArray();
    const classByName = {};
    for (const c of allClasses) classByName[c.name] = c.id;
    if ((await db.exams.count()) === 0) {
      for (const e of SEED_EXAMS) {
        const exam = { name: e.name, emoji: e.emoji, date: e.date, time: e.time, location: e.location, notes: e.notes };
        if (e.className && classByName[e.className]) exam.classId = classByName[e.className];
        await db.exams.add(exam);
      }
    } else {
      for (const e of await db.exams.toArray()) {
        if (e.classId) continue;
        let seed = SEED_EXAMS.find(s => s.date === e.date && (s.name === e.name || e.name.includes(s.name.split(' ').pop())));
        if (!seed) {
          for (const [cName, cId] of Object.entries(classByName)) {
            const words = cName.toLowerCase().split(/\s+/);
            if (words.some(w => w.length > 2 && e.name.toLowerCase().includes(w))) {
              await db.exams.update(e.id, { classId: cId });
              break;
            }
          }
          continue;
        }
        if (seed.className && classByName[seed.className]) {
          await db.exams.update(e.id, { classId: classByName[seed.className] });
        }
      }
    }
    return;
  }
  const classMap = {};
  for (const c of SEED_CLASSES) {
    const id = await db.classes.add(c);
    classMap[c.name] = id;
    const seedTopics = SEED_TOPICS_BY_CLASS[c.name];
    if (seedTopics) {
      for (const t of seedTopics) {
        await db.topics.add({ classId: id, name: t });
      }
    }
  }
  for (const b of SEED_BLOCKS) await db.blocks.add(b);
  for (const e of SEED_EXAMS) {
    const exam = { ...e };
    if (exam.className) {
      exam.classId = classMap[exam.className] || null;
      delete exam.className;
    }
    await db.exams.add(exam);
  }
}

export async function exportAllData() {
  const classes = await db.classes.toArray();
  const surveys = await db.surveys.toArray();
  const blocks = await db.blocks.toArray();
  const blockLogs = await db.blockLogs.toArray();
  const exams = await db.exams.toArray();
  const configs = await db.config.toArray();
  const summaries = await db.summaries.toArray();
  const topics = await db.topics.toArray();
  const topicLogs = await db.topicLogs.toArray();
  return {
    version: 3,
    exportedAt: new Date().toISOString(),
    classes, surveys, blocks, blockLogs, exams, configs, summaries, topics, topicLogs
  };
}

export async function repairOrphanedData() {
  let removed = { classes: 0, blocks: 0, exams: 0, topics: 0 };

  const allClasses = await db.classes.toArray();
  const seenNames = new Set();
  for (const c of allClasses) {
    if (seenNames.has(c.name)) {
      await db.classes.delete(c.id);
      removed.classes++;
    } else {
      seenNames.add(c.name);
    }
  }

  const allBlocks = await db.blocks.toArray();
  const seenBlockNames = new Set();
  for (const b of allBlocks) {
    if (seenBlockNames.has(b.name)) {
      await db.blocks.delete(b.id);
      removed.blocks++;
    } else {
      seenBlockNames.add(b.name);
    }
  }

  const allExams = await db.exams.toArray();
  const seenExamKeys = new Set();
  for (const e of allExams) {
    const key = e.name + '|' + e.date;
    if (seenExamKeys.has(key)) {
      await db.exams.delete(e.id);
      removed.exams++;
    } else {
      seenExamKeys.add(key);
    }
  }

  const allTopics = await db.topics.toArray();
  const seenTopicKeys = new Set();
  for (const t of allTopics) {
    const key = t.classId + '|' + t.name;
    if (seenTopicKeys.has(key)) {
      await db.topics.delete(t.id);
      removed.topics++;
    } else {
      seenTopicKeys.add(key);
    }
  }

  const syncRecords = await db.config.where({ key: 'lastSync' }).toArray();
  if (syncRecords.length > 1) {
    const [first, ...rest] = syncRecords.sort((a, b) => a.id - b.id);
    for (const r of rest) await db.config.delete(r.id);
  }

  const classes = await db.classes.toArray();
  const classById = {};
  const classByName = {};
  for (const c of classes) {
    classById[c.id] = c;
    classByName[c.name] = c;
  }

  const classesByDay = {};
  for (const c of classes) {
    if (!classesByDay[c.dayOfWeek]) classesByDay[c.dayOfWeek] = [];
    classesByDay[c.dayOfWeek].push(c);
  }

  let repairedSurveys = 0, repairedTopics = 0, repairedExams = 0;

  const surveys = await db.surveys.toArray();
  for (const s of surveys) {
    if (classById[s.classId]) continue;
    const parts = s.date.split('/');
    if (parts.length < 3) continue;
    const dateObj = new Date(+parts[2], +parts[1] - 1, +parts[0]);
    const dayOfWeek = dateObj.getDay();
    const adjustedDay = dayOfWeek === 0 ? 7 : dayOfWeek;
    const dayClasses = classesByDay[adjustedDay] || [];
    if (dayClasses.length === 1) {
      await db.surveys.update(s.id, { classId: dayClasses[0].id });
      repairedSurveys++;
    } else if (dayClasses.length > 1 && s.extra?.['Tema de clase']) {
      const topicName = s.extra['Tema de clase'];
      for (const c of dayClasses) {
        const seedTopics = SEED_TOPICS_BY_CLASS[c.name];
        if (seedTopics?.includes(topicName)) {
          await db.surveys.update(s.id, { classId: c.id });
          repairedSurveys++;
          break;
        }
      }
    }
  }

  const topics = await db.topics.toArray();
  for (const t of topics) {
    if (classById[t.classId]) continue;
    for (const [className, seedTopics] of Object.entries(SEED_TOPICS_BY_CLASS)) {
      if (seedTopics.includes(t.name) && classByName[className]) {
        await db.topics.update(t.id, { classId: classByName[className].id });
        repairedTopics++;
        break;
      }
    }
  }

  const exams = await db.exams.toArray();
  for (const e of exams) {
    if (classById[e.classId]) continue;
    const eLower = e.name.toLowerCase();
    for (const c of classes) {
      const words = c.name.toLowerCase().split(/\s+/);
      if (words.some(w => w.length > 2 && eLower.includes(w))) {
        await db.exams.update(e.id, { classId: c.id });
        repairedExams++;
        break;
      }
    }
  }

  return { removed, repairedSurveys, repairedTopics, repairedExams };
}

export async function importAllData(data) {
  if (!data || !data.version) throw new Error('Formato de archivo inválido');
  await db.classes.clear();
  await db.surveys.clear();
  await db.blocks.clear();
  await db.blockLogs.clear();
  await db.exams.clear();
  await db.config.clear();
  await db.summaries.clear();
  await db.topics.clear();
  await db.topicLogs.clear();
  const tables = ['classes', 'surveys', 'blocks', 'blockLogs', 'exams', 'configs', 'summaries', 'topics', 'topicLogs'];
  for (const t of tables) {
    const items = data[t];
    if (items?.length) {
      const table = t === 'configs' ? db.config : db[t];
      for (const item of items) {
        const { id, ...rest } = item;
        await table.add(rest);
      }
    }
  }
}
