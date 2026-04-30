import * as SQLite from 'expo-sqlite';

const db = SQLite.openDatabaseSync('dailylog.db');

export async function initDB() {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS carpetas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT,
      orden INTEGER
    );
    CREATE TABLE IF NOT EXISTS materias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      carpetaId INTEGER,
      nombre TEXT,
      emoji TEXT,
      dia INTEGER,
      horaInicio TEXT,
      horaFin TEXT,
      ubicacion TEXT,
      orden INTEGER
    );
    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      materiaId INTEGER,
      fecha TEXT,
      ejercicios TEXT,
      tiempo TEXT,
      tema TEXT,
      energia INTEGER,
      distraccion INTEGER,
      nota TEXT
    );
  `);

  const count = await db.getFirstAsync('SELECT COUNT(*) as cnt FROM materias');
  if (count.cnt === 0) {
    const res = await db.runAsync(
      'INSERT INTO carpetas (nombre, orden) VALUES (?, ?)',
      ['Primer Cuatrimestre', 0]
    );
    const carpetaId = res.lastInsertRowId;
    const materias = [
      ['Analisis Matematico I', '📘', 1, '08:30', '12:30', 'Campus', 0],
      ['Fisica I', '🍎', 2, '08:30', '12:30', 'Campus', 1],
      ['Algebra y Geometria Analitica', '➕✖️', 3, '08:30', '12:30', 'Campus', 2],
      ['Logica y Estructuras Discretas', '∑', 4, '07:45', '10:00', 'Medrano', 3],
      ['Sistemas y Procesos de Negocio', '💼', 4, '10:15', '12:30', 'Medrano', 4],
      ['Algoritmos y Estructura de Datos', '🖥️', 5, '08:30', '12:30', 'Campus', 5],
      ['Arquitectura de Computadores', '🧠', 6, '07:45', '11:00', 'Medrano', 6],
    ];
    for (const [nombre, emoji, dia, hi, hf, ubi, orden] of materias) {
      await db.runAsync(
        'INSERT INTO materias (carpetaId, nombre, emoji, dia, horaInicio, horaFin, ubicacion, orden) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [carpetaId, nombre, emoji, dia, hi, hf, ubi, orden]
      );
    }
  }
}

export function getCurrentMateria(materiasList) {
  const now = new Date();
  const diaActual = now.getDay();
  const minutosActual = now.getHours() * 60 + now.getMinutes();

  for (const m of materiasList) {
    if (m.dia !== diaActual) continue;
    const [hi, mi] = m.horaInicio.split(':').map(Number);
    const [hf, mf] = m.horaFin.split(':').map(Number);
    const inicioMin = hi * 60 + mi;
    const finMin = hf * 60 + mf;
    if (minutosActual >= inicioMin && minutosActual <= finMin) {
      return m;
    }
  }
  return null;
}

export async function getAllSync(table) {
  return await db.getAllAsync('SELECT * FROM ' + table);
}

export async function getFirstSync(table, where) {
  const keys = Object.keys(where);
  const vals = Object.values(where);
  const sql = 'SELECT * FROM ' + table + ' WHERE ' + keys.map(k => k + ' = ?').join(' AND ') + ' LIMIT 1';
  return await db.getFirstAsync(sql, vals);
}

export async function addSync(table, obj) {
  const keys = Object.keys(obj);
  const vals = Object.values(obj);
  const ph = keys.map(() => '?').join(', ');
  const sql = 'INSERT INTO ' + table + ' (' + keys.join(', ') + ') VALUES (' + ph + ')';
  return await db.runAsync(sql, vals);
}

export async function updateSync(table, id, obj) {
  const keys = Object.keys(obj);
  const vals = Object.values(obj);
  const sql = 'UPDATE ' + table + ' SET ' + keys.map(k => k + ' = ?').join(', ') + ' WHERE id = ?';
  return await db.runAsync(sql, [...vals, id]);
}
