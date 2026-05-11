import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, RATING_COLORS, RATING_LABELS, getMonthMetrics, generateWeekSummary, getMonthLabel, getOutputTemplate, getDaysSinceLastContact, getTopicStats, parseISODate, fmtDate, RATING_ORDER } from './db';



export function Metrics() {
  const classes = useLiveQuery(() => db.classes.toArray());
  const surveys = useLiveQuery(() => db.surveys.toArray());
  const blocks = useLiveQuery(() => db.blocks.toArray());
  const blockLogs = useLiveQuery(() => db.blockLogs.toArray());
  const exams = useLiveQuery(() => db.exams.toArray());
  const summaries = useLiveQuery(() => db.summaries.reverse().toArray());
  const [template, setTemplate] = useState(null);
  const [preview, setPreview] = useState('');
  const [topicStats, setTopicStats] = useState([]);
  const [expandedClass, setExpandedClass] = useState(null);
  const [editingTopic, setEditingTopic] = useState(null);

  useEffect(() => {
    getOutputTemplate().then(setTemplate);
  }, []);

  useEffect(() => {
    if (classes) {
      Promise.all(classes.map(c => getTopicStats(c.id))).then(results => {
        setTopicStats(results.flat());
      });
    }
  }, [classes]);

  if (!classes || !surveys || !blocks || !blockLogs || !exams || !template) {
    return <div className="loading">Cargando...</div>;
  }

  const metrics = getMonthMetrics(classes, surveys, blocks, blockLogs);
  const total = metrics.ratings[3] + metrics.ratings[2] + metrics.ratings[1];
  const avg = total > 0 ? ((metrics.ratings[3] * 3 + metrics.ratings[2] * 2 + metrics.ratings[1]) / total).toFixed(1) : '-';
  const pct = metrics.totalClasses > 0 ? Math.round((metrics.totalDone / metrics.totalClasses) * 100) : 0;
  const contactData = getDaysSinceLastContact(classes, surveys, blocks, blockLogs);

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  function getExamForClass(c) {
    const upcoming = exams.filter(e => {
      if (e.classId != null && e.classId !== '') return e.classId === c.id;
      return false;
    }).sort((a, b) => parseISODate(a.date) - parseISODate(b.date));
    return upcoming[0] || null;
  }

  function daysUntil(d) {
    return Math.ceil((d.getTime() - now.getTime()) / 86400000);
  }

  const genPreview = () => {
    setPreview(generateWeekSummary(classes, surveys, blocks, blockLogs, template));
  };

  const saveWeekSummary = async () => {
    const text = generateWeekSummary(classes, surveys, blocks, blockLogs, template);
    await db.summaries.add({
      weekStart: getMonthLabel(),
      content: text,
      createdAt: new Date().toISOString()
    });
    setPreview(text);
  };

  const refreshStats = () => {
    if (classes) {
      Promise.all(classes.map(c => getTopicStats(c.id))).then(results => {
        setTopicStats(results.flat());
      });
    }
  };

  const saveTopicCount = async (topicId, val) => {
    const todayStr = today();
    const count = Math.max(0, parseInt(val) || 0);
    const existing = await db.topicLogs.where({ topicId, date: todayStr }).first();
    if (count > 0) {
      const data = { topicId, date: todayStr, count, type: 'manual' };
      if (existing) await db.topicLogs.update(existing.id, data);
      else await db.topicLogs.add(data);
    } else if (existing) {
      await db.topicLogs.delete(existing.id);
    }
    setEditingTopic(null);
    refreshStats();
  };

  const copyText = async (text) => {
    try { await navigator.clipboard.writeText(text); } catch {}
  };

  return (
    <div className="metrics-page">
      <div className="metrics-grid">
        <div className="metric-card">
          <span className="metric-value">{metrics.totalDone}</span>
          <span className="metric-label">Encuestas este mes</span>
        </div>
        <div className="metric-card">
          <span className="metric-value">{pct}%</span>
          <span className="metric-label">Asistencia</span>
        </div>
        <div className="metric-card">
          <span className="metric-value">{avg}</span>
          <span className="metric-label">Promedio /3</span>
        </div>
        <div className="metric-card">
          <span className="metric-value">{metrics.blockLogsThisMonth.filter(l => l.done).length}</span>
          <span className="metric-label">Bloques hechos</span>
        </div>
      </div>

      <div className="metrics-section">
        <h3 className="metrics-section-title">Estado por materia</h3>
        {classes.map(c => {
          const contact = contactData.find(d => d.class.id === c.id);
          const daysSince = contact?.daysSince ?? null;
          const contactColor = daysSince === null ? 'var(--red)' : daysSince >= 5 ? 'var(--red)' : daysSince >= 2 ? 'var(--yellow)' : 'var(--green)';
          const exam = getExamForClass(c);
          const examDays = exam ? daysUntil(parseISODate(exam.date)) : null;
          const cTopics = topicStats.filter(t => t.classId === c.id);
          const totalEjs = cTopics.reduce((s, t) => s + t.totalCount, 0);
          const doneTopics = cTopics.filter(t => t.totalCount > 0).length;
          const isOpen = expandedClass === c.id;
          const recentRating = surveys.filter(s => s.classId === c.id).sort((a, b) => b.createdAt?.localeCompare?.(a.createdAt) || 0)[0];
          return (
            <div key={c.id} className="unified-class-card">
              <div className="unified-class-main" onClick={() => setExpandedClass(isOpen ? null : c.id)}>
                <div className="unified-class-left">
                  <span className="unified-class-emoji">{c.emoji}</span>
                  <div className="unified-class-info">
                    <span className="unified-class-name">{c.name}</span>
                    <div className="unified-class-badges">
                      <span className="unified-badge" style={{ color: contactColor }}>
                        {daysSince === null ? '✕' : `${daysSince}d`}
                      </span>
                      {exam && (
                        <span className="unified-badge exam-badge">
                          📝 {examDays}d
                        </span>
                      )}
                      {recentRating && (
                        <span className="unified-badge rating-badge" style={{ background: RATING_COLORS[recentRating.rating] }}>
                          {RATING_LABELS[recentRating.rating]}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="unified-class-right">
                  {cTopics.length > 0 && (
                    <span className="unified-topic-summary">{doneTopics}/{cTopics.length} temas · {totalEjs} ej.</span>
                  )}
                  <span className="unified-class-arrow">{isOpen ? '▼' : '▶'}</span>
                </div>
              </div>
              {isOpen && (
                <div className="unified-class-body">
                  {cTopics.length > 0 && (
                    <div className="unified-topics-list">
                      {cTopics.map(t => {
                        const lastDate = t.logs.sort((a, b) => b.date?.localeCompare?.(a.date) || 0)[0];
                        return (
                          <div key={t.id} className="unified-topic-item">
                            <span className="unified-topic-name">{t.name}</span>
                            {editingTopic?.id === t.id ? (
                              <input className="unified-topic-edit" type="number" min="0" value={editingTopic.value}
                                onChange={e => setEditingTopic({ id: t.id, value: e.target.value })}
                                onBlur={() => saveTopicCount(t.id, editingTopic.value)}
                                onKeyDown={e => { if (e.key === 'Enter') saveTopicCount(t.id, editingTopic.value); if (e.key === 'Escape') setEditingTopic(null); }}
                                autoFocus />
                            ) : (
                              <span className="unified-topic-count">
                                {t.totalCount > 0 ? `${t.totalCount} ej.` : '—'}
                              </span>
                            )}
                            <button className="unified-topic-edit-btn" onClick={e => { e.stopPropagation(); setEditingTopic({ id: t.id, value: t.totalCount }); }}
                              title="Editar ejercicios">✏️</button>
                            {lastDate && <span className="unified-topic-date">últ: {lastDate.date}</span>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {exam && (
                    <div className="unified-exam-info">
                      📝 {exam.emoji || ''} {exam.name} — {fmtDate(parseISODate(exam.date))}{exam.time ? ` ${exam.time}` : ''}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="metrics-section">
        <h3 className="metrics-section-title">Distribución de ratings — {getMonthLabel()}</h3>
        <div className="rating-bars">
          {RATING_ORDER.map(r => {
            const count = metrics.ratings[r] || 0;
            const maxCount = Math.max(metrics.ratings[3] || 0, metrics.ratings[2] || 0, metrics.ratings[1] || 0, 1);
            return (
              <div key={r} className="rating-bar-row">
                <span className="rating-bar-dot" style={{ background: RATING_COLORS[r] }} />
                <span className="rating-bar-label">{RATING_LABELS[r]}</span>
                <div className="rating-bar-track">
                  <div className="rating-bar-fill" style={{ width: `${(count / maxCount) * 100}%`, background: RATING_COLORS[r] }} />
                </div>
                <span className="rating-bar-count">{count}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="metrics-section">
        <div className="metrics-section-header">
          <h3 className="metrics-section-title">Resumen semanal</h3>
          <div className="metrics-section-actions">
            <button className="btn btn-secondary btn-sm" onClick={genPreview}>Vista previa</button>
            <button className="btn btn-primary btn-sm" onClick={saveWeekSummary}>Guardar</button>
          </div>
        </div>

        {preview && (
          <div className="preview-box">
            <div className="preview-box-header">
              <span>Vista previa</span>
              <button className="btn-copy btn-sm" onClick={() => copyText(preview)}>Copiar</button>
            </div>
            <pre className="preview-box-text">{preview}</pre>
          </div>
        )}

        {summaries?.length > 0 && (
          <div className="summaries-list" style={{ marginTop: 12 }}>
            {summaries.slice(0, 5).map(s => (
              <div key={s.id} className="summary-card">
                <div className="summary-card-header">
                  <span className="summary-card-date">{new Date(s.createdAt).toLocaleDateString('es-ES')}</span>
                  <button className="btn-copy btn-sm" onClick={() => copyText(s.content)}>Copiar</button>
                </div>
                <pre className="summary-card-text">{s.content}</pre>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
