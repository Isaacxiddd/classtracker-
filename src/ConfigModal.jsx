import { useState, useEffect } from 'react';
import { db } from './db';

const DIAS_SEMANA = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export function ConfigModal({ isOpen, onClose, onSave }) {
  const [materias, setMaterias] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      db.materias.toArray().then(data => {
        setMaterias(data);
        setLoading(false);
      });
    }
  }, [isOpen]);

  const handleAddMateria = () => {
    setMaterias([...materias, {
      nombre: '',
      emoji: '📚',
      dia: 1,
      horaInicio: '08:00',
      horaFin: '10:00',
      ubicacion: ''
    }]);
  };

  const handleUpdateMateria = (index, field, value) => {
    const updated = [...materias];
    updated[index][field] = value;
    setMaterias(updated);
  };

  const handleDeleteMateria = async (index) => {
    const materia = materias[index];
    if (materia.id) {
      await db.materias.delete(materia.id);
    }
    setMaterias(materias.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    await db.materias.clear();
    for (const m of materias) {
      if (m.nombre) {
        await db.materias.put({
          nombre: m.nombre,
          emoji: m.emoji,
          dia: m.dia,
          horaInicio: m.horaInicio,
          horaFin: m.horaFin,
          ubicacion: m.ubicacion
        });
      }
    }
    onSave();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Configurar Materias</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        
        <div className="modal-body">
          {loading ? (
            <p>Cargando...</p>
          ) : (
            <>
              {materias.map((materia, index) => (
                <div key={index} className="config-row">
                  <input
                    type="text"
                    placeholder="Nombre"
                    value={materia.nombre}
                    onChange={e => handleUpdateMateria(index, 'nombre', e.target.value)}
                    className="config-input"
                  />
                  <input
                    type="text"
                    placeholder="Emoji"
                    value={materia.emoji}
                    onChange={e => handleUpdateMateria(index, 'emoji', e.target.value)}
                    className="config-input emoji-input"
                  />
                  <select
                    value={materia.dia}
                    onChange={e => handleUpdateMateria(index, 'dia', parseInt(e.target.value))}
                    className="config-input"
                  >
                    {DIAS_SEMANA.slice(1).map((dia, i) => (
                      <option key={i + 1} value={i + 1}>{dia}</option>
                    ))}
                  </select>
                  <input
                    type="time"
                    value={materia.horaInicio}
                    onChange={e => handleUpdateMateria(index, 'horaInicio', e.target.value)}
                    className="config-input time-input"
                  />
                  <input
                    type="time"
                    value={materia.horaFin}
                    onChange={e => handleUpdateMateria(index, 'horaFin', e.target.value)}
                    className="config-input time-input"
                  />
                  <input
                    type="text"
                    placeholder="Ubicación"
                    value={materia.ubicacion}
                    onChange={e => handleUpdateMateria(index, 'ubicacion', e.target.value)}
                    className="config-input"
                  />
                  <button 
                    className="btn-delete"
                    onClick={() => handleDeleteMateria(index)}
                  >
                    🗑️
                  </button>
                </div>
              ))}
              
              <button className="btn-add" onClick={handleAddMateria}>
                + Agregar Materia
              </button>
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-cancel" onClick={onClose}>Cancelar</button>
          <button className="btn-save" onClick={handleSave}>Guardar</button>
        </div>
      </div>
    </div>
  );
}