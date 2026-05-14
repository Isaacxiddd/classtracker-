import { useState, useEffect, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  db, getCurrentClass, getClassesJustEnded, getOutputTemplate, getConfig, saveConfig,
  getDayColor, toggleBlockDone, getClassesForPeriod, getMonday, addWeeks, fmtDate,
  saveBlockSurvey, DEFAULT_CLASS_SURVEY_CONFIG, DEFAULT_BLOCK_SURVEY_CONFIG, DEFAULT_TEMPLATES,
  generateGeminiPrompt, seedIfEmpty, parseISODate, exportAllData, importAllData, repairOrphanedData,
  RATING_COLORS, RATING_LABELS, RATING_ORDER, DIAS, today, isFuture, getTopicsForClass
} from './db';
import { ScheduleSetup } from './ScheduleSetup';
import { SurveyConfigModal } from './SurveyConfigModal';
import { Metrics } from './Metrics';
import { requestPermission, sendNotif, registerSW, scheduleNotifications } from './notifications';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { initSupabase, isConnected, fullSync } from './supabase';
import './App.css';

function App() {
  const classes = useLiveQuery(() => db.classes.toArray());
  const surveys = useLiveQuery(() => db.surveys.toArray());
  const blocks = useLiveQuery(() => db.blocks.toArray());
  const blockLogs = useLiveQuery(() => db.blockLogs.toArray());
  const exams = useLiveQuery(() => db.exams.toArray());

  const [tab, setTab] = useState('semana');
  const [showSetup, setShowSetup] = useState(false);
  const [showSurveyConfig, setShowSurveyConfig] = useState(false);
  const [surveyConfig, setSurveyConfig] = useState(DEFAULT_CLASS_SURVEY_CONFIG);
  const [outputTemplate, setOutputTemplate] = useState(DEFAULT_TEMPLATES);
  const [currentClass, setCurrentClass] = useState(null);
  const [countdown, setCountdown] = useState(null);
  const [showSurvey, setShowSurvey] = useState(false);
  const [surveyClass, setSurveyClass] = useState(null);
  const [surveyExisting, setSurveyExisting] = useState(null);
  const [surveyRating, setSurveyRating] = useState(3);
  const [surveyNotes, setSurveyNotes] = useState('');
  const [surveyCustom, setSurveyCustom] = useState({});
  const [surveyDateStr, setSurveyDateStr] = useState(null);
  const [surveyTopics, setSurveyTopics] = useState([]);
  const [surveyTopicEntries, setSurveyTopicEntries] = useState({});
  const [notifGranted, setNotifGranted] = useState(false);
  const [showBlockNotes, setShowBlockNotes] = useState(null);
  const [blockNotesText, setBlockNotesText] = useState('');
  const [blockNotesDate, setBlockNotesDate] = useState(null);
  const [viewDate, setViewDate] = useState(() => getMonday(new Date()));
  const [blockSurveyConfig, setBlockSurveyConfig] = useState(DEFAULT_BLOCK_SURVEY_CONFIG);
  const [showBlockSurvey, setShowBlockSurvey] = useState(false);
  const [blockSurveyBlock, setBlockSurveyBlock] = useState(null);
  const [blockSurveyLogId, setBlockSurveyLogId] = useState(null);
  const [blockSurveyExtra, setBlockSurveyExtra] = useState({});
  const [blockSurveyNotes, setBlockSurveyNotes] = useState('');
  const [blockSurveyDate, setBlockSurveyDate] = useState(null);
  const [geminiPrompt, setGeminiPrompt] = useState('');
  const [showGemini, setShowGemini] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [importMsg, setImportMsg] = useState('');
  const [repairMsg, setRepairMsg] = useState('');
  const [syncStatus, setSyncStatus] = useState('off');
  const [syncMsg, setSyncMsg] = useState('');

  useEffect(() => { registerSW(); }, []);

  useEffect(() => {
    const ok = initSupabase();
    setSyncStatus(ok ? 'connected' : 'off');
  }, []);

  useEffect(() => {
    if (syncStatus !== 'connected' || !classes || !surveys) return;
    const doAutoSync = async () => {
      setSyncMsg('Sincronizando...');
      const r = await fullSync(db, m => setSyncMsg(m));
      if (r.ok) {
        setSyncStatus('connected');
        setSyncMsg(`✅ ${r.pushed} subidos · ${r.pulled} bajados`);
      } else {
        setSyncStatus('error');
        setSyncMsg(`❌ ${r.error || 'Error de sync'}`);
      }
    };
    const timer = setTimeout(doAutoSync, 2000);
    return () => clearTimeout(timer);
  }, [syncStatus, classes?.length, surveys?.length]);

  useEffect(() => {
    if (!('Notification' in window)) return;
    setNotifGranted(Notification.permission === 'granted');
  }, []);

  useEffect(() => {
    getOutputTemplate().then(setOutputTemplate).catch(() => setOutputTemplate(DEFAULT_TEMPLATES));
  }, []);

  useEffect(() => {
    if (classes?.length) {
      getConfig('surveyConfig', DEFAULT_CLASS_SURVEY_CONFIG).then(setSurveyConfig).catch(() => {});
    }
  }, [classes]);

  useEffect(() => {
    if (blocks?.length) {
      getConfig('blockSurveyConfig', DEFAULT_BLOCK_SURVEY_CONFIG).then(setBlockSurveyConfig);
    }
  }, [blocks]);

  useEffect(() => {
    if (classes && blocks && !seeding) {
      setSeeding(true);
      seedIfEmpty();
    }
  }, [classes, blocks]);

  useEffect(() => {
    if (!classes?.length) return;
    setCurrentClass(getCurrentClass(classes));
  }, [classes]);

  useEffect(() => {
    if (!currentClass) return;
    const timer = setInterval(() => {
      const c = getCurrentClass(classes);
      if (c) {
        const now = new Date();
        const [hf, mf] = c.endTime.split(':').map(Number);
        const end = new Date(now);
        end.setHours(hf, mf, 0, 0);
        const diff = Math.ceil((end.getTime() - now.getTime()) / 60000);
        setCountdown(diff > 0 ? diff : 0);
      } else {
        setCountdown(null);
      }
    }, 10000);
    return () => clearInterval(timer);
  }, [currentClass]);

  useEffect(() => {
    if (!classes?.length || !surveys) return;
    scheduleNotifications(classes, blocks, surveys, blockLogs);
  }, [classes, blocks, surveys, blockLogs]);

  useEffect(() => {
    if (!classes?.length || !surveys) return;
    const check = () => {
      getClassesJustEnded(classes, surveys).forEach(c => {
        sendNotif('Clase finalizada', `${c.name} terminó. ¿Cómo fue?`);
        promptSurvey(c);
      });
    };
    check();
    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, [classes, surveys]);

  const promptSurvey = useCallback(async (class_, existing, dateStr) => {
    setSurveyClass(class_);
    setSurveyExisting(existing || null);
    setSurveyRating(existing?.rating || 3);
    setSurveyNotes(existing?.notes || '');
    setSurveyCustom(existing?.extra || {});
    setSurveyDateStr(dateStr || existing?.date || today());
    const date = dateStr || existing?.date || today();
    const topics = await getTopicsForClass(class_.id);
    setSurveyTopics(topics);
    const logs = await db.topicLogs.where({ date }).toArray();
    const entries = {};
    for (const t of topics) {
      const log = logs.find(l => l.topicId === t.id);
      entries[t.id] = log
        ? { active: true, count: log.count ?? 0, type: log.type || 'ejercicio' }
        : { active: false, count: 0, type: 'ejercicio' };
    }
    setSurveyTopicEntries(entries);
    setShowSurvey(true);
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    LocalNotifications.createChannel({
      id: 'class-tracker',
      name: 'Class Tracker',
      description: 'Recordatorios de clases y sesiones de estudio',
      importance: 4,
      visibility: 1,
    }).catch(() => {});
    let cancelled = false;
    (async () => {
      const handle = await LocalNotifications.addListener('localNotificationActionPerformed', (n) => {
        if (cancelled) return;
        const { classId, date } = n.notification.extra || {};
        if (classId != null && date && classes) {
          const c = classes.find(cls => cls.id === classId);
          if (c) {
            const existing = surveys?.find(s => s.classId === classId && s.date === date);
            promptSurvey(c, existing || null, date);
          }
        }
      });
      if (cancelled) handle.remove();
    })();
    return () => { cancelled = true; };
  }, [classes, surveys, promptSurvey]);

  const openBlockSurvey = (block, log, dateStr) => {
    setBlockSurveyBlock(block);
    setBlockSurveyLogId(log?.id || null);
    setBlockSurveyExtra(log?.extra || {});
    setBlockSurveyNotes(log?.notes || '');
    setBlockSurveyDate(dateStr);
    setShowBlockSurvey(true);
  };

  const submitBlockSurvey = async () => {
    if (!blockSurveyBlock || !blockSurveyDate) return;
    const extra = {};
    if (blockSurveyConfig?.customFields?.length) {
      blockSurveyConfig.customFields.forEach(f => {
        const val = blockSurveyExtra[f.id];
        extra[f.label] = val !== undefined && val !== '' ? val : '';
      });
    }
    await saveBlockSurvey(blockSurveyBlock.id, blockSurveyDate, extra, blockSurveyConfig?.notesEnabled ? blockSurveyNotes : '');
    setShowBlockSurvey(false);
    setBlockSurveyBlock(null);
    setBlockSurveyLogId(null);
    setBlockSurveyExtra({});
    setBlockSurveyNotes('');
    setBlockSurveyDate(null);
  };

  const submitSurvey = async () => {
    if (!surveyClass) return;
    const dateStr = surveyDateStr || today();
    const extra = {};
    if (surveyConfig?.customFields?.length) {
      surveyConfig.customFields.forEach(f => {
        const val = surveyCustom[f.id];
        extra[f.label] = val !== undefined && val !== '' ? val : '';
      });
    }
    const payload = {
      classId: surveyClass.id, date: dateStr, rating: surveyRating,
      notes: surveyConfig?.notesEnabled ? surveyNotes : '', extra, createdAt: new Date().toISOString()
    };
    if (surveyExisting) {
      await db.surveys.update(surveyExisting.id, payload);
    } else {
      await db.surveys.add(payload);
    }
    for (const t of surveyTopics) {
      const entry = surveyTopicEntries[t.id];
      const existingLog = await db.topicLogs.where({ topicId: t.id, date: dateStr }).first();
      if (entry?.active) {
        const logData = { topicId: t.id, date: dateStr, count: entry.count ?? 0, type: entry.type || 'ejercicio' };
        if (existingLog) {
          await db.topicLogs.update(existingLog.id, logData);
        } else {
          await db.topicLogs.add(logData);
        }
      } else if (existingLog) {
        await db.topicLogs.delete(existingLog.id);
      }
    }
    setShowSurvey(false);
    setSurveyExisting(null);
  };

  const handleToggleBlock = async (blockId, currentlyDone, dateStr) => {
    const newDone = !currentlyDone;
    await toggleBlockDone(blockId, newDone, dateStr || today());
    if (newDone) {
      const log = await db.blockLogs.where({ blockId, date: dateStr }).first();
      const hasData = log?.extra && Object.values(log.extra).some(v => v);
      if (!hasData) {
        const block = blocks?.find(b => b.id === blockId);
        if (block) openBlockSurvey(block, log, dateStr);
      }
    }
  };

  const handleBlockNotes = async (blockId) => {
    const dateStr = blockNotesDate || today();
    const existing = await db.blockLogs.where({ blockId, date: dateStr }).first();
    if (existing) {
      await db.blockLogs.update(existing.id, { notes: blockNotesText });
    } else {
      await db.blockLogs.add({ blockId, date: dateStr, done: false, notes: blockNotesText });
    }
    setShowBlockNotes(null);
    setBlockNotesText('');
    setBlockNotesDate(null);
  };

  const askNotif = async () => {
    const granted = await requestPermission();
    setNotifGranted(granted);
  };

  const genGemini = () => {
    setGeminiPrompt(generateGeminiPrompt(classes, surveys, blocks, blockLogs, exams));
    setShowGemini(true);
  };

  if (!classes || !blocks) {
    return <div className="app"><div className="loading">Cargando...</div></div>;
  }

  if ((classes.length === 0 && blocks.length === 0 && !seeding) || showSetup) {
    return <ScheduleSetup onComplete={() => { setShowSetup(false); setSeeding(false); }} onBack={classes.length > 0 || blocks.length > 0 ? () => setShowSetup(false) : undefined} />;
  }

  const weekDays = getClassesForPeriod(classes, surveys, blocks, blockLogs, viewDate);

  const updateTemplate = async (field, value) => {
    const updated = { ...outputTemplate, [field]: value };
    setOutputTemplate(updated);
    await saveConfig(updated);
  };

  return (
    <div className="app">
      <main className="container">
        {tab === 'semana' && (
          <>
            <header>
              <div className="header-top">
                <h1>Mi Semana</h1>
                <div className="header-actions">
                  <button className="config-btn gemini-btn" onClick={genGemini} title="Generar prompt para Gemini">🤖</button>
                  {!notifGranted && (
                    <button className="config-btn notif-btn" onClick={askNotif} title="Activar notificaciones">🔔</button>
                  )}
                  <button className="config-btn" onClick={() => setShowSurveyConfig(true)} title="Personalizar encuesta">📋</button>
                  <button className="config-btn" onClick={() => setShowSetup(true)} title="Editar horario">⚙️</button>
                </div>
              </div>

              <div className="week-nav">
                <button className="week-nav-btn" onClick={() => setViewDate(addWeeks(viewDate, -1))}>‹</button>
                <span className="week-nav-label">Semana del {fmtDate(viewDate)}</span>
                <button className="week-nav-btn" onClick={() => setViewDate(addWeeks(viewDate, 1))}>›</button>
                <button className="week-nav-today" onClick={() => setViewDate(getMonday(new Date()))}>Hoy</button>
              </div>
            </header>

            {currentClass && (
              <div className="current-class-banner">
                <span className="current-class-emoji">{currentClass.emoji}</span>
                <div>
                  <strong>{currentClass.name}</strong>
                  <span className="current-class-time">{currentClass.startTime} - {currentClass.endTime}</span>
                </div>
                {countdown !== null && countdown > 0 && (
                  <span className="current-class-countdown">{countdown} min</span>
                )}
                {countdown !== null && countdown <= 5 && (
                  <button className="btn-survey-now" onClick={() => promptSurvey(currentClass)}>Encuesta</button>
                )}
              </div>
            )}

            <section className="classes-week">
              {weekDays.map(day => {
                const dayColor = getDayColor(day.classes);
                return (
                  <div key={day.dayNum} className={`day-column ${day.isToday ? 'today' : ''} ${dayColor ? `day-color-${dayColor}` : ''} ${day.isFuture ? 'day-future' : ''}`}>
                    <h3 className="day-header">{DIAS[day.dayNum]}</h3>
                    <span className="day-date">{day.dateObj.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</span>

                    {exams?.filter(e => fmtDate(parseISODate(e.date)) === day.dateStr).map(e => {
                      let examClass = classes?.find(c => c.id === e.classId);
                      if (!examClass) {
                        const eLower = e.name.toLowerCase();
                        examClass = classes?.find(c => c.name.toLowerCase().split(/\s+/).some(w => w.length > 2 && eLower.includes(w)));
                      }
                      return (
                      <div key={e.id} className="day-exam" title={e.notes || e.location || e.name}>
                        <span className="day-exam-emoji">{e.emoji || '📝'}</span>
                        <span className="day-exam-name">{e.name}{examClass ? ` · ${examClass.emoji}` : ''}</span>
                        {e.time && <span className="day-exam-time">{e.time}</span>}
                      </div>
                      );
                    })}

                    {day.classes.map(c => (
                      <button key={c.id} className={`day-class ${c.survey ? `rating-${c.survey.rating}` : ''}`}
                        onClick={() => promptSurvey(c, c.survey, day.dateStr)}
                        disabled={day.isFuture && !c.survey}>
                        <span className="day-class-emoji">{c.emoji}</span>
                        <span className="day-class-name">{c.name}</span>
                        <span className="day-class-time">{c.startTime}</span>
                        {c.survey && <span className="day-class-dot" style={{ background: RATING_COLORS[c.survey.rating] }} />}
                        {!c.survey && day.isToday && <span className="day-class-dot pending-dot" />}
                        {day.isFuture && !c.survey && <span className="day-class-dot day-locked-dot">🔒</span>}
                      </button>
                    ))}
                    {day.classes.length === 0 && exams?.filter(e => fmtDate(parseISODate(e.date)) === day.dateStr).length === 0 && day.blocks.length === 0 && (
                      <p className="day-empty">—</p>
                    )}
                    {day.blocks.map(b => (
                      <div key={b.id} className={`day-block ${b.log?.done ? 'done' : ''}`}>
                        <button className="day-block-check" onClick={() => handleToggleBlock(b.id, b.log?.done, day.dateStr)} disabled={day.isFuture}>
                          {b.log?.done ? '✅' : '⬜'}
                        </button>
                        <button className="day-block-name-btn" onClick={() => openBlockSurvey(b, b.log, day.dateStr)} disabled={day.isFuture}>
                          <span className="day-class-emoji">{b.emoji}</span>
                          <span className="day-class-name">{b.name}</span>
                        </button>
                        <button className="day-block-notes-btn" onClick={() => { setShowBlockNotes(b.id); setBlockNotesText(b.log?.notes || ''); setBlockNotesDate(day.dateStr); }} title="Nota" disabled={day.isFuture}>📝</button>
                      </div>
                    ))}
                  </div>
                );
              })}
            </section>
          </>
        )}

        {tab === 'metricas' && <Metrics />}

        {tab === 'config' && (
          <div className="config-page">
            <h1 className="page-title">Configuración</h1>

            <div className="config-page-section">
              <h3>🔔 Notificaciones</h3>
              <p className="config-page-desc">
                {notifGranted ? '✅ Activadas' : '❌ Desactivadas'}
              </p>
              {!notifGranted && (
                <button className="btn btn-primary btn-sm" onClick={askNotif}>Activar</button>
              )}
            </div>

            <div className="config-page-section">
              <h3>📚 Horario</h3>
              <p className="config-page-desc">{classes.length} materias · {blocks.length} bloques</p>
              <button className="btn btn-primary btn-sm" onClick={() => setShowSetup(true)}>Editar</button>
            </div>

            <div className="config-page-section">
              <h3>📋 Encuesta</h3>
              <p className="config-page-desc">Personalizar preguntas</p>
              <button className="btn btn-primary btn-sm" onClick={() => setShowSurveyConfig(true)}>Personalizar</button>
            </div>

            <div className="config-page-section">
              <h3>📄 Plantilla de output</h3>
              <p className="config-page-desc">
                Personalizá cómo se genera el resumen semanal.
                <br />
                <strong>{'{WEEK}'}</strong> = semana · <strong>{'{DAY_NAME}'}</strong> = día · <strong>{'{DAY_DATE}'}</strong> = fecha
                <br />
                <strong>{'{CLASSES}'}</strong> = clases del día · <strong>{'{BLOCKS}'}</strong> = bloques del día
                <br />
                <strong>{'{DONE}'}</strong> / <strong>{'{TOTAL}'}</strong> = completadas · <strong>{'{AVG}'}</strong> = promedio
              </p>

              <label className="output-template-label">Antes de los días:</label>
              <textarea
                className="output-template-input"
                value={outputTemplate.headerTemplate}
                onChange={e => updateTemplate('headerTemplate', e.target.value)}
                rows={3}
              />

              <label className="output-template-label">Por cada día (con {'{DAY_NAME}'}, {'{CLASSES}'}, {'{BLOCKS}'}):</label>
              <textarea
                className="output-template-input"
                value={outputTemplate.dayTemplate}
                onChange={e => updateTemplate('dayTemplate', e.target.value)}
                rows={4}
              />

              <label className="output-template-label">Después de los días:</label>
              <textarea
                className="output-template-input"
                value={outputTemplate.footerTemplate}
                onChange={e => updateTemplate('footerTemplate', e.target.value)}
                rows={3}
              />
            </div>

            <div className="config-page-section">
              <h3>☁️ Sincronización en la nube</h3>
              <p className="config-page-desc">
                {syncStatus === 'off' && '❌ No configurado — falta .env'}
                {syncStatus === 'connected' && '✅ Conectado a Supabase'}
                {syncStatus === 'syncing' && '🔄 Sincronizando...'}
                {syncStatus === 'error' && '⚠️ Error de conexión'}
                {syncStatus === 'done' && '✅ Sincronizado'}
              </p>
              {syncMsg && <p className="sync-msg">{syncMsg}</p>}
              <button className="btn btn-primary btn-sm" onClick={async () => {
                setSyncStatus('syncing');
                setSyncMsg('Sincronizando...');
                const r = await fullSync(db, m => setSyncMsg(m));
                setSyncStatus(r.ok ? 'connected' : 'error');
                setSyncMsg(r.ok ? `✅ ${r.pushed} subidos · ${r.pulled} bajados` : `❌ ${r.error || 'Error'}`);
              }} disabled={syncStatus === 'syncing'}>
                Sync ahora
              </button>
            </div>

            <div className="config-page-section">
              <h3>💾 Exportar / Importar datos</h3>
              <p className="config-page-desc">Respaldo completo de todas las materias, encuestas, temas, bloques y configuración.</p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button className="btn btn-primary btn-sm" onClick={async () => {
                  const data = await exportAllData();
                  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `class-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}>Exportar</button>
                <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
                  Importar
                  <input type="file" accept=".json" style={{ display: 'none' }} onChange={async e => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      const text = await file.text();
                      const data = JSON.parse(text);
                      await importAllData(data);
                      setImportMsg('✅ Datos importados correctamente');
                      setTimeout(() => setImportMsg(''), 4000);
                      window.location.reload();
                    } catch (err) {
                      setImportMsg('❌ Error: ' + err.message);
                      setTimeout(() => setImportMsg(''), 6000);
                    }
                    e.target.value = '';
                  }} />
                </label>
              </div>
              {importMsg && <p style={{ fontSize: '0.75rem', marginTop: 8, color: 'var(--text-secondary)' }}>{importMsg}</p>}
            </div>

            <div className="config-page-section">
              <h3>🔧 Reparar datos</h3>
              <p className="config-page-desc">Si las encuestas o temas perdieron la referencia a sus materias (por el bug anterior al guardar horario), esto los re-vincula automáticamente.</p>
              <button className="btn btn-primary btn-sm" onClick={async () => {
                setRepairMsg('Reparando...');
                const r = await repairOrphanedData();
                setRepairMsg(`✅ ${r.repairedSurveys} encuestas · ${r.repairedTopics} temas · ${r.repairedExams} exámenes reparados`);
                setTimeout(() => setRepairMsg(''), 6000);
              }}>Reparar</button>
              {repairMsg && <p style={{ fontSize: '0.75rem', marginTop: 8, color: 'var(--text-secondary)' }}>{repairMsg}</p>}
            </div>
          </div>
        )}
      </main>

      <nav className="bottom-nav">
        <button className={`bottom-nav-btn ${tab === 'semana' ? 'active' : ''}`} onClick={() => setTab('semana')}>
          <span className="bottom-nav-icon">📅</span>
          <span className="bottom-nav-label">Semana</span>
        </button>
        <button className={`bottom-nav-btn ${tab === 'metricas' ? 'active' : ''}`} onClick={() => setTab('metricas')}>
          <span className="bottom-nav-icon">📊</span>
          <span className="bottom-nav-label">Métricas</span>
        </button>
        <button className={`bottom-nav-btn ${tab === 'config' ? 'active' : ''}`} onClick={() => setTab('config')}>
          <span className="bottom-nav-icon">⚙️</span>
          <span className="bottom-nav-label">Config</span>
        </button>
      </nav>

      {showBlockNotes && (
        <div className="modal-overlay" onClick={() => setShowBlockNotes(null)}>
          <div className="modal-content survey-modal" onClick={e => e.stopPropagation()}>
            <h2>Notas del bloque</h2>
            <textarea placeholder="¿Qué hiciste?" value={blockNotesText} onChange={e => setBlockNotesText(e.target.value)} rows={4} />
            <div className="survey-actions">
              <button className="btn btn-secondary" onClick={() => setShowBlockNotes(null)}>Cerrar</button>
              <button className="btn btn-primary" onClick={() => handleBlockNotes(showBlockNotes)}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      {showSurvey && (
        <div className="modal-overlay" onClick={() => setShowSurvey(false)}>
          <div className="modal-content survey-modal" onClick={e => e.stopPropagation()}>
            <h2>¿Cómo fue {surveyClass?.name}?</h2>
            <div className="survey-ratings">
              {RATING_ORDER.map(r => (
                <button key={r} className={`survey-rating-btn ${surveyRating === r ? 'active' : ''}`} style={{ '--rating-color': RATING_COLORS[r] }} onClick={() => setSurveyRating(r)}>
                  <span className="survey-rating-dot" style={{ background: RATING_COLORS[r] }} />
                  {RATING_LABELS[r]}
                </button>
              ))}
            </div>
            {surveyConfig?.notesEnabled && (
              <textarea placeholder="Notas (opcional)" value={surveyNotes} onChange={e => setSurveyNotes(e.target.value)} rows={3} />
            )}
            {surveyConfig?.customFields?.map(f => (
              <div key={f.id} className="survey-custom-field">
                <label>{f.label}</label>
                {f.type === 'text' && (
                  <input value={surveyCustom[f.id] || ''} onChange={e => setSurveyCustom({ ...surveyCustom, [f.id]: e.target.value })} placeholder={f.label} />
                )}
                {f.type === 'rating' && (
                  <div className="survey-custom-rating">
                    {[1, 2, 3, 4, 5].map(n => (
                      <button key={n} className={`survey-custom-rating-btn ${surveyCustom[f.id] === n ? 'active' : ''}`} onClick={() => setSurveyCustom({ ...surveyCustom, [f.id]: n })}>{n}</button>
                    ))}
                  </div>
                )}
                {f.type === 'boolean' && (
                  <div className="survey-boolean">
                    <button className={`survey-bool-btn ${surveyCustom[f.id] === true ? 'active' : ''}`} onClick={() => setSurveyCustom({ ...surveyCustom, [f.id]: true })}>✅ Sí</button>
                    <button className={`survey-bool-btn ${surveyCustom[f.id] === false ? 'active' : ''}`} onClick={() => setSurveyCustom({ ...surveyCustom, [f.id]: false })}>❌ No</button>
                  </div>
                )}
                {f.type === 'number' && (
                  <input type="number" value={surveyCustom[f.id] ?? ''} onChange={e => setSurveyCustom({ ...surveyCustom, [f.id]: e.target.value ? Number(e.target.value) : '' })} placeholder="0" />
                )}
                {f.type === 'select' && f.options?.length > 0 && (
                  <div className="survey-select-options">
                    {f.options.map(o => (
                      <button key={o} className={`survey-select-btn ${surveyCustom[f.id] === o ? 'active' : ''}`} onClick={() => setSurveyCustom({ ...surveyCustom, [f.id]: o })}>{o}</button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {surveyTopics.length > 0 && (
              <div className="survey-topics-section">
                <div className="survey-topics-title">Temas trabajados</div>
                {surveyTopics.map(t => {
                  const entry = surveyTopicEntries[t.id] || { active: false, count: 0, type: 'ejercicio' };
                  return (
                    <div key={t.id} className="survey-topic-row">
                      <button className="survey-topic-active" onClick={() => setSurveyTopicEntries({
                        ...surveyTopicEntries,
                        [t.id]: { ...entry, active: !entry.active }
                      })}>
                        {entry.active ? '✅' : '⬜'}
                      </button>
                      <span className="survey-topic-name">{t.name}</span>
                      {entry.active && (
                        <>
                          <div className="survey-topic-count">
                            <input type="number" min="0" value={entry.count} onChange={e => setSurveyTopicEntries({
                              ...surveyTopicEntries,
                              [t.id]: { ...entry, count: +e.target.value }
                            })} />
                          </div>
                          <div className="survey-topic-type">
                            <select value={entry.type} onChange={e => setSurveyTopicEntries({
                              ...surveyTopicEntries,
                              [t.id]: { ...entry, type: e.target.value }
                            })}>
                              <option value="ejercicio">Ej.</option>
                              <option value="tp">TP</option>
                              <option value="lectura">Lect.</option>
                              <option value="parcial">Parcial</option>
                              <option value="otro">Otro</option>
                            </select>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <div className="survey-actions">
              <button className="btn btn-secondary" onClick={() => setShowSurvey(false)}>Después</button>
              <button className="btn btn-primary" onClick={submitSurvey}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      {showBlockSurvey && blockSurveyConfig && (
        <div className="modal-overlay" onClick={() => setShowBlockSurvey(false)}>
          <div className="modal-content survey-modal" onClick={e => e.stopPropagation()}>
            <h2>📝 {blockSurveyBlock?.name}</h2>
            {blockSurveyConfig.customFields?.map(f => (
              <div key={f.id} className="survey-custom-field">
                <label>{f.label}</label>
                {f.type === 'text' && (
                  <input value={blockSurveyExtra[f.id] || ''} onChange={e => setBlockSurveyExtra({ ...blockSurveyExtra, [f.id]: e.target.value })} placeholder={f.label} />
                )}
                {f.type === 'rating' && (
                  <div className="survey-custom-rating">
                    {[1, 2, 3, 4, 5].map(n => (
                      <button key={n} className={`survey-custom-rating-btn ${blockSurveyExtra[f.id] === n ? 'active' : ''}`} onClick={() => setBlockSurveyExtra({ ...blockSurveyExtra, [f.id]: n })}>{n}</button>
                    ))}
                  </div>
                )}
                {f.type === 'boolean' && (
                  <div className="survey-boolean">
                    <button className={`survey-bool-btn ${blockSurveyExtra[f.id] === true ? 'active' : ''}`} onClick={() => setBlockSurveyExtra({ ...blockSurveyExtra, [f.id]: true })}>✅ Sí</button>
                    <button className={`survey-bool-btn ${blockSurveyExtra[f.id] === false ? 'active' : ''}`} onClick={() => setBlockSurveyExtra({ ...blockSurveyExtra, [f.id]: false })}>❌ No</button>
                  </div>
                )}
                {f.type === 'number' && (
                  <input type="number" value={blockSurveyExtra[f.id] ?? ''} onChange={e => setBlockSurveyExtra({ ...blockSurveyExtra, [f.id]: e.target.value ? Number(e.target.value) : '' })} placeholder="0" />
                )}
                {f.type === 'select' && f.options?.length > 0 && (
                  <div className="survey-select-options">
                    {f.options.map(o => (
                      <button key={o} className={`survey-select-btn ${blockSurveyExtra[f.id] === o ? 'active' : ''}`} onClick={() => setBlockSurveyExtra({ ...blockSurveyExtra, [f.id]: o })}>{o}</button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {blockSurveyConfig?.notesEnabled && (
              <textarea placeholder="Notas (opcional)" value={blockSurveyNotes} onChange={e => setBlockSurveyNotes(e.target.value)} rows={3} />
            )}
            <div className="survey-actions">
              <button className="btn btn-secondary" onClick={() => setShowBlockSurvey(false)}>Cerrar</button>
              <button className="btn btn-primary" onClick={submitBlockSurvey}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      {showGemini && (
        <div className="modal-overlay" onClick={() => setShowGemini(false)}>
          <div className="modal-content survey-config-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>🤖 Contexto para Gemini</h2>
              <button className="modal-close" onClick={() => setShowGemini(false)}>×</button>
            </div>
            <div className="modal-body">
              <pre className="gemini-output">{geminiPrompt}</pre>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowGemini(false)}>Cerrar</button>
              <button className="btn btn-primary" onClick={() => { try { navigator.clipboard.writeText(geminiPrompt); } catch {} }}>Copiar y pegar en Gemini</button>
            </div>
          </div>
        </div>
      )}

      <SurveyConfigModal isOpen={showSurveyConfig} onClose={() => setShowSurveyConfig(false)} />
    </div>
  );
}

export default App;
