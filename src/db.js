import Dexie from 'dexie';

export const db = new Dexie('DailyLogDB');

db.version(1).stores({
  materias: '++id, nombre, emoji, dia, horaInicio, horaFin, ubicacion',
  logs: '++id, materiaId, fecha, ejercicios, tiempo, tema, energia, distraccion, nota'
});

let initPromise = null;
export async function initDefaultMaterias() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const count = await db.materias.count();
    if (count === 0) {
      await db.materias.bulkAdd([
        { nombre: 'Análisis Matemático I', emoji: '📘', dia: 1, horaInicio: '08:30', horaFin: '12:30', ubicacion: 'Campus' },
        { nombre: 'Física I', emoji: '🍎', dia: 2, horaInicio: '08:30', horaFin: '12:30', ubicacion: 'Campus' },
        { nombre: 'Álgebra y Geometría Analítica', emoji: '➕✖️', dia: 3, horaInicio: '08:30', horaFin: '12:30', ubicacion: 'Campus' },
        { nombre: 'Lógica y Estructuras Discretas', emoji: '∑', dia: 4, horaInicio: '07:45', horaFin: '10:00', ubicacion: 'Medrano' },
        { nombre: 'Sistemas y Procesos de Negocio', emoji: '💼', dia: 4, horaInicio: '10:15', horaFin: '12:30', ubicacion: 'Medrano' },
        { nombre: 'Algoritmos y Estructura de Datos', emoji: '🖥️', dia: 5, horaInicio: '08:30', horaFin: '12:30', ubicacion: 'Campus' },
        { nombre: 'Arquitectura de Computadores', emoji: '🧠', dia: 6, horaInicio: '07:45', horaFin: '11:00', ubicacion: 'Medrano' },
      ]);
    }
  })();
  return initPromise;
}

export function getCurrentMateria(materias) {
  const now = new Date();
  const diaActual = now.getDay();
  const minutosActual = now.getHours() * 60 + now.getMinutes();

  const materiaActual = materias.find(m => {
    if (m.dia !== diaActual) return false;
    const [hi, mi] = m.horaInicio.split(':').map(Number);
    const [hf, mf] = m.horaFin.split(':').map(Number);
    const inicioMin = hi * 60 + mi;
    const finMin = hf * 60 + mf;
    return minutosActual >= inicioMin && minutosActual <= finMin;
  });

  return materiaActual || null;
}