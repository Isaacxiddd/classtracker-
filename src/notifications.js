const scheduledTimeouts = new Set();

export async function requestPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

export function sendNotif(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body, icon: '/favicon.svg', tag: 'class-tracker' });
  } catch {}
}

function scheduleAt(target, title, body) {
  const delay = target.getTime() - Date.now();
  if (delay < 0 || delay > 7 * 86400000) return;
  const id = setTimeout(() => {
    sendNotif(title, body);
    scheduledTimeouts.delete(id);
  }, delay);
  scheduledTimeouts.add(id);
}

function getTodayDates() {
  const now = new Date();
  const today = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    d.setHours(0, 0, 0, 0);
    today.push(d);
  }
  return today;
}

function parseTime(str) {
  if (!str) return null;
  const [h, m] = str.split(':').map(Number);
  return { h, m };
}

export function scheduleNotifications(classes, blocks, surveys, blockLogs) {
  for (const id of scheduledTimeouts) clearTimeout(id);
  scheduledTimeouts.clear();

  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const dates = getTodayDates();
  const todayStr = new Date().toLocaleDateString('es-ES');

  dates.forEach(dateObj => {
    const dayOfWeek = dateObj.getDay() || 7;
    const dateStr = dateObj.toLocaleDateString('es-ES');

    classes?.filter(c => c.dayOfWeek === dayOfWeek).forEach(c => {
      if (surveys?.some(s => s.classId === c.id && s.date === dateStr)) return;
      const t = parseTime(c.endTime);
      if (!t) return;
      const notifTime = new Date(dateObj);
      notifTime.setHours(t.h, t.m, 0, 0);
      notifTime.setTime(notifTime.getTime() + 2 * 60000);
      scheduleAt(notifTime, 'Clase finalizada', `${c.emoji} ${c.name} terminó. ¿Cómo fue?`);
    });

    blocks?.filter(b => b.dayOfWeek === dayOfWeek).forEach(b => {
      const alreadyDone = blockLogs?.some(l => l.blockId === b.id && l.date === dateStr && l.done && l.extra && Object.values(l.extra).some(v => v));
      if (alreadyDone) return;
      const t = parseTime(b.endTime);
      if (!t) return;
      const notifTime = new Date(dateObj);
      notifTime.setHours(t.h, t.m, 0, 0);
      notifTime.setTime(notifTime.getTime() + 120 * 60000);
      scheduleAt(notifTime, 'Sesión de estudio', `${b.emoji} ${b.name} — ¿cómo te fue? Completá la encuesta.`);
    });
  });
}

export function registerSW() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
      try {
        await navigator.serviceWorker.register('/sw.js');
      } catch {}
    });
  }
  requestPermission();
}
