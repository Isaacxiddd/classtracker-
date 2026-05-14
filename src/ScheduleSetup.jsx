import { useState, useEffect } from 'react';
import { db, DIAS } from './db';

const defaultClass = { name: '', emoji: '📚', dayOfWeek: 1, startTime: '08:00', endTime: '10:00', location: '' };
const defaultBlock = { name: '', emoji: '📝', dayOfWeek: 1, startTime: '10:00', endTime: '11:00' };
const defaultExam = { name: '', emoji: '📝', date: '', time: '', location: '', notes: '', classId: '' };

export function ScheduleSetup({ onComplete, onBack }) {
  const [tab, setTab] = useState('classes');
  const [classes, setClasses] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [exams, setExams] = useState([]);
  const [topics, setTopics] = useState([]);
  const [topicClassId, setTopicClassId] = useState(null);
  const [newTopicName, setNewTopicName] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      db.classes.toArray(),
      db.blocks.toArray(),
      db.exams.toArray(),
      db.topics.toArray()
    ]).then(([c, b, e, t]) => {
      setClasses(c);
      setBlocks(b);
      setExams(e);
      setTopics(t);
      if (c.length) setTopicClassId(c[0].id);
      setLoading(false);
    });
  }, []);

  const updateList = (list, setter, index, field, value) => {
    const updated = [...list];
    updated[index] = { ...updated[index], [field]: value };
    setter(updated);
  };

  const removeItem = async (list, setter, table, index) => {
    const item = list[index];
    if (item.id) await table.delete(item.id);
    setter(list.filter((_, i) => i !== index));
  };

  const save = async () => {
    const existingClasses = await db.classes.toArray();
    const existingIds = existingClasses.map(c => c.id);
    const keepIds = classes.filter(c => c.id).map(c => c.id);
    for (const id of existingIds) {
      if (!keepIds.includes(id)) await db.classes.delete(id);
    }
    for (const c of classes) {
      if (!c.name) continue;
      const data = { name: c.name, emoji: c.emoji, dayOfWeek: c.dayOfWeek, startTime: c.startTime, endTime: c.endTime, location: c.location };
      if (c.id) await db.classes.update(c.id, data);
      else await db.classes.add(data);
    }

    const existingBlocks = await db.blocks.toArray();
    const existingBlockIds = existingBlocks.map(b => b.id);
    const keepBlockIds = blocks.filter(b => b.id).map(b => b.id);
    for (const id of existingBlockIds) {
      if (!keepBlockIds.includes(id)) await db.blocks.delete(id);
    }
    for (const b of blocks) {
      if (!b.name) continue;
      const data = { name: b.name, emoji: b.emoji, dayOfWeek: b.dayOfWeek, startTime: b.startTime, endTime: b.endTime };
      if (b.id) await db.blocks.update(b.id, data);
      else await db.blocks.add(data);
    }

    const existingExams = await db.exams.toArray();
    const existingExamIds = existingExams.map(e => e.id);
    const keepExamIds = exams.filter(e => e.id).map(e => e.id);
    for (const id of existingExamIds) {
      if (!keepExamIds.includes(id)) await db.exams.delete(id);
    }
    for (const e of exams) {
      if (!e.name || !e.date) continue;
      const data = { name: e.name, emoji: e.emoji, date: e.date, time: e.time, location: e.location, notes: e.notes, classId: e.classId || null };
      if (e.id) await db.exams.update(e.id, data);
      else await db.exams.add(data);
    }
    onComplete?.();
  };

  if (loading) return <div className="loading">Cargando...</div>;

  return (
    <div className="setup-container">
      <div className="setup-top">
        {onBack && <button className="setup-back" onClick={onBack}>← Volver</button>}
        <h1 className="setup-title">Mi Horario</h1>
      </div>

      <div className="setup-tabs">
        <button className={`setup-tab ${tab === 'classes' ? 'active' : ''}`} onClick={() => setTab('classes')}>Materias</button>
        <button className={`setup-tab ${tab === 'blocks' ? 'active' : ''}`} onClick={() => setTab('blocks')}>Bloques</button>
        <button className={`setup-tab ${tab === 'exams' ? 'active' : ''}`} onClick={() => setTab('exams')}>Exámenes</button>
        <button className={`setup-tab ${tab === 'topics' ? 'active' : ''}`} onClick={() => setTab('topics')}>Temas</button>
      </div>

      {tab === 'classes' && (
        <>
          <p className="setup-subtitle">Materias de cursada</p>
          <div className="setup-classes">
            {classes.map((c, i) => (
              <div key={i} className="setup-class-card">
                <div className="setup-class-header">
                  <span className="setup-class-num">{i + 1}</span>
                  <button className="setup-remove" onClick={() => removeItem(classes, setClasses, db.classes, i)}>✕</button>
                </div>
                <div className="setup-class-fields">
                  <input placeholder="Nombre" value={c.name} onChange={e => updateList(classes, setClasses, i, 'name', e.target.value)} />
                  <input placeholder="Emoji" value={c.emoji} onChange={e => updateList(classes, setClasses, i, 'emoji', e.target.value)} className="setup-emoji" />
                  <select value={c.dayOfWeek} onChange={e => updateList(classes, setClasses, i, 'dayOfWeek', +e.target.value)}>
                    {DIAS.filter(Boolean).map((d, idx) => (<option key={idx + 1} value={idx + 1}>{d}</option>))}
                  </select>
                  <div className="setup-time-group"><label>Inicio</label><input type="time" value={c.startTime} onChange={e => updateList(classes, setClasses, i, 'startTime', e.target.value)} /></div>
                  <div className="setup-time-group"><label>Fin</label><input type="time" value={c.endTime} onChange={e => updateList(classes, setClasses, i, 'endTime', e.target.value)} /></div>
                  <input placeholder="Ubicación (opcional)" value={c.location} onChange={e => updateList(classes, setClasses, i, 'location', e.target.value)} />
                </div>
              </div>
            ))}
          </div>
          <button className="setup-add" onClick={() => setClasses([...classes, { ...defaultClass }])}>+ Agregar materia</button>
        </>
      )}

      {tab === 'blocks' && (
        <>
          <p className="setup-subtitle">Bloques de estudio libre</p>
          <div className="setup-classes">
            {blocks.map((b, i) => (
              <div key={i} className="setup-class-card">
                <div className="setup-class-header">
                  <span className="setup-class-num">{i + 1}</span>
                  <button className="setup-remove" onClick={() => removeItem(blocks, setBlocks, db.blocks, i)}>✕</button>
                </div>
                <div className="setup-class-fields">
                  <input placeholder="Ej: Repaso Análisis" value={b.name} onChange={e => updateList(blocks, setBlocks, i, 'name', e.target.value)} />
                  <input placeholder="Emoji" value={b.emoji} onChange={e => updateList(blocks, setBlocks, i, 'emoji', e.target.value)} className="setup-emoji" />
                  <select value={b.dayOfWeek} onChange={e => updateList(blocks, setBlocks, i, 'dayOfWeek', +e.target.value)}>
                    {DIAS.filter(Boolean).map((d, idx) => (<option key={idx + 1} value={idx + 1}>{d}</option>))}
                  </select>
                  <div className="setup-time-group"><label>Inicio</label><input type="time" value={b.startTime} onChange={e => updateList(blocks, setBlocks, i, 'startTime', e.target.value)} /></div>
                  <div className="setup-time-group"><label>Fin</label><input type="time" value={b.endTime} onChange={e => updateList(blocks, setBlocks, i, 'endTime', e.target.value)} /></div>
                </div>
              </div>
            ))}
          </div>
          <button className="setup-add" onClick={() => setBlocks([...blocks, { ...defaultBlock }])}>+ Agregar bloque</button>
        </>
      )}

      {tab === 'exams' && (
        <>
          <p className="setup-subtitle">Exámenes y entregas</p>
          <div className="setup-classes">
            {exams.map((e, i) => (
              <div key={i} className="setup-class-card">
                <div className="setup-class-header">
                  <span className="setup-class-num">{i + 1}</span>
                  <button className="setup-remove" onClick={() => removeItem(exams, setExams, db.exams, i)}>✕</button>
                </div>
                <div className="setup-class-fields">
                  <input placeholder="Nombre" value={e.name} onChange={val => updateList(exams, setExams, i, 'name', val.target.value)} />
                  <input placeholder="Emoji" value={e.emoji} onChange={val => updateList(exams, setExams, i, 'emoji', val.target.value)} className="setup-emoji" />
                  <select value={e.classId || ''} onChange={val => updateList(exams, setExams, i, 'classId', val ? +val.target.value : '')}>
                    <option value="">Sin materia</option>
                    {classes.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
                  </select>
                  <div className="setup-time-group"><label>Fecha</label><input type="date" value={e.date} onChange={val => updateList(exams, setExams, i, 'date', val.target.value)} /></div>
                  <div className="setup-time-group"><label>Hora</label><input type="time" value={e.time} onChange={val => updateList(exams, setExams, i, 'time', val.target.value)} /></div>
                  <input placeholder="Ubicación (opcional)" value={e.location} onChange={val => updateList(exams, setExams, i, 'location', val.target.value)} />
                  <input placeholder="Notas (opcional)" value={e.notes} onChange={val => updateList(exams, setExams, i, 'notes', val.target.value)} />
                </div>
              </div>
            ))}
          </div>
          <button className="setup-add" onClick={() => setExams([...exams, { ...defaultExam }])}>+ Agregar examen</button>
        </>
      )}

      {tab === 'topics' && (
        <>
          <p className="setup-subtitle">Temas por materia</p>
          <select className="setup-class-select" value={topicClassId ?? ''} onChange={e => setTopicClassId(+e.target.value)}>
            {classes.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
          </select>
          <div className="setup-topic-list">
            {topics.filter(t => t.classId === topicClassId).map(t => (
              <div key={t.id} className="setup-topic-row">
                <span className="setup-topic-name">{t.name}</span>
                <button className="setup-remove" onClick={async () => {
                  await db.topics.delete(t.id);
                  setTopics(topics.filter(x => x.id !== t.id));
                }}>✕</button>
              </div>
            ))}
          </div>
          <div className="setup-add-topic">
            <input value={newTopicName} onChange={e => setNewTopicName(e.target.value)} placeholder="Nuevo tema..." />
            <button className="btn btn-primary btn-sm" onClick={async () => {
              if (!newTopicName.trim() || !topicClassId) return;
              const id = await db.topics.add({ classId: topicClassId, name: newTopicName.trim() });
              setTopics([...topics, { id, classId: topicClassId, name: newTopicName.trim() }]);
              setNewTopicName('');
            }}>Agregar</button>
          </div>
        </>
      )}

      <button className="setup-save" onClick={save}>Guardar horario</button>
    </div>
  );
}
