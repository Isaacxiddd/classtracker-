import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

const isNative = Capacitor.isNativePlatform();

function makeNotifId(type, id, dateStr) {
  let hash = 0;
  const s = `${type}-${id}-${dateStr}`;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash) + s.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 2147483647;
}

function parseTime(str) {
  if (!str) return null;
  const [h, m] = str.split(':').map(Number);
  return { h, m };
}

export async function requestPermission() {
  if (isNative) {
    try {
      const perm = await LocalNotifications.requestPermissions();
      return perm.display === 'granted';
    } catch { return false; }
  }
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

export function sendNotif(title, body) {
  if (isNative) {
    try {
      LocalNotifications.schedule({
        notifications: [{ title, body, id: Date.now() % 2147483647, schedule: { at: new Date(Date.now() + 2000) } }]
      });
    } catch {}
    return;
  }
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body, icon: '/favicon.svg', tag: 'class-tracker' });
  } catch {}
}

export async function scheduleNotifications(classes, blocks, surveys, blockLogs) {
  const granted = isNative
    ? (await LocalNotifications.requestPermissions()).display === 'granted'
    : ('Notification' in window && Notification.permission === 'granted');
  if (!granted) return;

  try { await LocalNotifications.cancelAll(); } catch {}

  const now = new Date();
  const today = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    d.setHours(0, 0, 0, 0);
    today.push(d);
  }
  const todayStr = now.toLocaleDateString('es-ES');
  const notifs = [];

  today.forEach((dateObj, dayOffset) => {
    const dayOfWeek = dateObj.getDay() || 7;
    const dateStr = dateObj.toLocaleDateString('es-ES');

    classes?.filter(c => c.dayOfWeek === dayOfWeek).forEach(c => {
      if (surveys?.some(s => s.classId === c.id && s.date === dateStr)) return;
      const t = parseTime(c.endTime);
      if (!t) return;
      const at = new Date(dateObj);
      at.setHours(t.h, t.m, 0, 0);
      at.setTime(at.getTime() + 2 * 60000);
      if (at <= now) return;
      notifs.push({
        id: makeNotifId('class', c.id, dateStr),
        title: 'Clase finalizada',
        body: `${c.emoji} ${c.name} terminó. ¿Cómo fue?`,
        schedule: { at },

        actionTypeId: 'SURVEY_CLASS',
        extra: { classId: c.id, date: dateStr },
      });
    });

    blocks?.filter(b => b.dayOfWeek === dayOfWeek).forEach(b => {
      const alreadyDone = blockLogs?.some(l =>
        l.blockId === b.id && l.date === dateStr && l.done && l.extra && Object.values(l.extra).some(v => v)
      );
      if (alreadyDone) return;
      const t = parseTime(b.endTime);
      if (!t) return;
      const at = new Date(dateObj);
      at.setHours(t.h, t.m, 0, 0);
      at.setTime(at.getTime() + 120 * 60000);
      if (at <= now) return;
      notifs.push({
        id: makeNotifId('block', b.id, dateStr),
        title: 'Sesión de estudio',
        body: `${b.emoji} ${b.name} — ¿cómo te fue? Completá la encuesta.`,
        schedule: { at },

      });
    });
  });

  if (notifs.length === 0) return;
  try { await LocalNotifications.schedule({ notifications: notifs }); } catch {}
}

export function registerSW() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
      try { await navigator.serviceWorker.register('/sw.js'); } catch {}
    });
  }
  if (!isNative) requestPermission();
}
