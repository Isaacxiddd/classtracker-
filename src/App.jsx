import { useState, useEffect, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getCurrentMateria, initDefaultMaterias } from './db';
import { ConfigModal } from './ConfigModal';
import './App.css';

const ENERGIA_LABELS = { 1: 'muerto', 2: 'bajo', 3: 'normal', 4: 'bien', 5: 'óptimo' };
const DISTRACCION_LABELS = { 1: 'foco total', 2: 'algo de ruido', 3: 'intermedio', 4: 'distraído', 5: 'desastre' };
const DIAS = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

function App() {
  const materias = useLiveQuery(() => db.materias.toArray());
  const [expanded, setExpanded] = useState(null);
  const [showConfig, setShowConfig] = useState(false);
  const [output, setOutput] = useState('');
  const [copied, setCopied] = useState(false);
  const [materiaActual, setMateriaActual] = useState(null);

  const emptyDatos = useCallback(() => ({}), []);

  useEffect(() => {
    initDefaultMaterias();
  }, []);

  useEffect(() => {
    if (materias) {
      const actual = getCurrentMateria(materias);
      setMateriaActual(actual);
      if (actual && expanded === null) {
        setExpanded(actual.id);
      }
    }
  }, [materias]);

  useEffect(() => {
    if (materias && !expanded && materiaActual) {
      setExpanded(materiaActual.id);
    }
  }, [materias, materiaActual]);

  const getDatos = async (materiaId, fecha) => {
    const existing = await db.logs.where({ materiaId, fecha }).first();
    return existing || {
      materiaId,
      fecha,
      ejercicios: '',
      tiempo: '',
      tema: '',
      energia: 3,
      distraccion: 3,
      nota: ''
    };
  };

  const [datos, setDatos] = useState({});

  useEffect(() => {
    if (materias?.length) {
      const fecha = new Date().toLocaleDateString('es-ES');
      Promise.all(
        materias.map(m => getDatos(m.id, fecha))
      ).then(results => {
        const datosMap = {};
        results.forEach((d, i) => {
          datosMap[materias[i].id] = d;
        });
        setDatos(datosMap);
      });
    }
  }, [materias]);

  const toggleExpanded = (id) => {
    setExpanded(expanded === id ? null : id);
  };

  const updateDato = useCallback((materiaId, campo, value) => {
    setDatos(prev => ({
      ...prev,
      [materiaId]: { ...prev[materiaId], [campo]: value }
    }));
  }, []);

  const saveDato = useCallback(async (materiaId) => {
    const dato = datos[materiaId];
    if (!dato) return;
    const fecha = new Date().toLocaleDateString('es-ES');
    const existing = await db.logs.where({ materiaId, fecha }).first();
    if (existing) {
      await db.logs.update(existing.id, dato);
    } else {
      await db.logs.add({ ...dato, materiaId, fecha });
    }
  }, [datos]);

  useEffect(() => {
    if (Object.keys(datos).length > 0 && materias?.length) {
      Object.keys(datos).forEach(mid => {
        const timeoutId = setTimeout(() => saveDato(parseInt(mid)), 500);
        return () => clearTimeout(timeoutId);
      });
    }
  }, [datos, materias]);

  const generarOutput = () => {
    if (!materias) return;
    const fecha = new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    let texto = `📅 Daily Log — ${fecha}\n\n`;

    materias.forEach((m) => {
      const d = datos[m.id];
      if (d && (d.ejercicios || d.tiempo || d.tema || d.nota)) {
        texto += `${m.emoji} ${m.nombre}\n`;
        if (d.ejercicios) texto += `├─ Ejercicios: ${d.ejercicios}\n`;
        if (d.tiempo) texto += `├─ Tiempo: ${d.tiempo} min\n`;
        if (d.tema) texto += `├─ Tema: ${d.tema}\n`;
        texto += `├─ Energía: ${d.energia}/5 (${ENERGIA_LABELS[d.energia]})\n`;
        texto += `├─ Distracción: ${d.distraccion}/5 (${DISTRACCION_LABELS[d.distraccion]})\n`;
        if (d.nota) texto += `└─ Nota: ${d.nota}\n`;
        texto += '\n';
      }
    });

    setOutput(texto.trim());
    setCopied(false);
  };

  const copiarOutput = async () => {
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Error al copiar:', err);
    }
  };

  const resetear = async () => {
    const fecha = new Date().toLocaleDateString('es-ES');
    await db.logs.where({ fecha }).delete();
    setDatos({});
    setOutput('');
  };

  if (!materias) {
    return (
      <main className="container">
        <div className="loading">Cargando...</div>
      </main>
    );
  }

  return (
    <main className="container">
      <header>
        <div className="header-top">
          <h1>Daily Log</h1>
          <button className="config-btn" onClick={() => setShowConfig(true)} title="Configurar">
            ⚙️
          </button>
        </div>
        <p className="subtitle">
          {DIAS[new Date().getDay()]} — {new Date().toLocaleDateString('es-ES')}
        </p>
        {materiaActual && (
          <div className="ahora-badge">
            📚 AHORA: {materiaActual.nombre}
          </div>
        )}
      </header>

      <div className="materias-grid">
        {materias.map((materia) => {
          const isExpanded = expanded === materia.id;
          const d = datos[materia.id];
          const esActual = materiaActual?.id === materia.id;
          
          return (
            <div key={materia.id} className={`materia-card ${isExpanded ? 'expanded' : ''} ${esActual ? 'actual' : ''}`}>
              <button className="materia-header" onClick={() => toggleExpanded(materia.id)}>
                <span className="materia-emoji">{materia.emoji}</span>
                <span className="materia-nombre">{materia.nombre}</span>
                <span className="materia-toggle">{isExpanded ? '−' : '+'}</span>
              </button>
              
              {isExpanded && d && (
                <div className="materia-body">
                  <div className="materia-info">
                    {DIAS[materia.dia]} · {materia.horaInicio}-{materia.horaFin} · {materia.ubicacion}
                  </div>
                  
                  <div className="campo-row">
                    <div className="campo">
                      <label>Ejercicios</label>
                      <input
                        type="number"
                        min="0"
                        value={d.ejercicios || ''}
                        onChange={(e) => updateDato(materia.id, 'ejercicios', e.target.value)}
                        placeholder="0"
                      />
                    </div>
                    <div className="campo">
                      <label>Tiempo (min)</label>
                      <input
                        type="number"
                        min="0"
                        value={d.tiempo || ''}
                        onChange={(e) => updateDato(materia.id, 'tiempo', e.target.value)}
                        placeholder="0"
                      />
                    </div>
                  </div>

                  <div className="campo">
                    <label>Tema específico</label>
                    <input
                      type="text"
                      value={d.tema || ''}
                      onChange={(e) => updateDato(materia.id, 'tema', e.target.value)}
                      placeholder="Ej: Límites, derivadas..."
                    />
                  </div>

                  <div className="interpretacion-section">
                    <div className="interpretacion-row">
                      <div className="interpretacion">
                        <label><span className="label-icon">⚡</span> Energía</label>
                        <div className="slider-container">
                          <input
                            type="range"
                            min="1"
                            max="5"
                            value={d.energia || 3}
                            onChange={(e) => updateDato(materia.id, 'energia', parseInt(e.target.value))}
                            className="slider energia-slider"
                          />
                          <div className="slider-labels">
                            {[1, 2, 3, 4, 5].map(n => (
                              <span key={n} className={(d?.energia || 3) === n ? 'active' : ''}>{n}</span>
                            ))}
                          </div>
                          <span className="slider-value">{ENERGIA_LABELS[d?.energia || 3]}</span>
                        </div>
                      </div>

                      <div className="interpretacion">
                        <label><span className="label-icon">🎯</span> Distracción</label>
                        <div className="slider-container">
                          <input
                            type="range"
                            min="1"
                            max="5"
                            value={d.distraccion || 3}
                            onChange={(e) => updateDato(materia.id, 'distraccion', parseInt(e.target.value))}
                            className="slider distraccion-slider"
                          />
                          <div className="slider-labels">
                            {[1, 2, 3, 4, 5].map(n => (
                              <span key={n} className={(d?.distraccion || 3) === n ? 'active' : ''}>{n}</span>
                            ))}
                          </div>
                          <span className="slider-value">{DISTRACCION_LABELS[d?.distraccion || 3]}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="campo">
                    <label>Anotaciones</label>
                    <textarea
                      value={d.nota || ''}
                      onChange={(e) => updateDato(materia.id, 'nota', e.target.value)}
                      placeholder="Notas, dudas, observaciones..."
                      rows={2}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="acciones">
        <button className="btn btn-primary" onClick={generarOutput}>
          Generar Output
        </button>
        <button className="btn btn-secondary" onClick={resetear}>
          Resetear
        </button>
      </div>

      {output && (
        <section className="output-section">
          <div className="output-header">
            <h2>Output</h2>
            <button className="btn-copy" onClick={copiarOutput}>
              {copied ? '✓ Copiado' : 'Copiar'}
            </button>
          </div>
          <pre className="output-text">{output}</pre>
        </section>
      )}

      <ConfigModal isOpen={showConfig} onClose={() => setShowConfig(false)} onSave={() => {}} />
    </main>
  );
}

export default App;