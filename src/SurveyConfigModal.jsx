import { useState, useEffect } from 'react';
import { getConfig, saveConfig, DEFAULT_CLASS_SURVEY_CONFIG, DEFAULT_BLOCK_SURVEY_CONFIG } from './db';

const FIELD_TYPES = [
  { value: 'text', label: 'Texto' },
  { value: 'rating', label: 'Rating (1-5)' },
  { value: 'boolean', label: 'Sí / No' },
  { value: 'number', label: 'Número' },
  { value: 'select', label: 'Selección' },
];

const CONFIGS = [
  { key: 'surveyConfig', label: 'Clase', defaults: DEFAULT_CLASS_SURVEY_CONFIG },
  { key: 'blockSurveyConfig', label: 'Bloque', defaults: DEFAULT_BLOCK_SURVEY_CONFIG },
];

export function SurveyConfigModal({ isOpen, onClose }) {
  const [tab, setTab] = useState(0);
  const [config, setConfig] = useState(null);
  const [currentKey, setCurrentKey] = useState('surveyConfig');

  useEffect(() => {
    if (isOpen) {
      const c = CONFIGS[tab];
      setCurrentKey(c.key);
      getConfig(c.key, c.defaults).then(setConfig);
    }
  }, [isOpen, tab]);

  if (!isOpen || !config) return null;

  const addField = () => setConfig({
    ...config,
    customFields: [...config.customFields, { id: Date.now(), label: '', type: 'text', options: [] }]
  });

  const updateField = (id, field, value) => setConfig({
    ...config,
    customFields: config.customFields.map(f => f.id === id ? { ...f, [field]: value } : f)
  });

  const removeField = (id) => setConfig({
    ...config,
    customFields: config.customFields.filter(f => f.id !== id)
  });

  const addOption = (id) => {
    const f = config.customFields.find(x => x.id === id);
    if (!f) return;
    updateField(id, 'options', [...(f.options || []), '']);
  };

  const updateOption = (fieldId, optIdx, value) => {
    const f = config.customFields.find(x => x.id === fieldId);
    if (!f) return;
    const opts = [...(f.options || [])];
    opts[optIdx] = value;
    updateField(fieldId, 'options', opts);
  };

  const removeOption = (fieldId, optIdx) => {
    const f = config.customFields.find(x => x.id === fieldId);
    if (!f) return;
    updateField(fieldId, 'options', f.options.filter((_, i) => i !== optIdx));
  };

  const save = async () => {
    await saveConfig({ ...config, key: currentKey });
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content survey-config-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Personalizar Encuestas</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="setup-tabs" style={{ marginBottom: 14 }}>
            {CONFIGS.map((c, i) => (
              <button key={c.key} className={`setup-tab ${tab === i ? 'active' : ''}`} onClick={() => setTab(i)}>{c.label}</button>
            ))}
          </div>

          <label className="config-toggle">
            <input type="checkbox" checked={config.notesEnabled} onChange={e => setConfig({ ...config, notesEnabled: e.target.checked })} />
            Mostrar campo de notas
          </label>

          <div className="config-section-title">Campos personalizados</div>
          {config.customFields.map(f => (
            <div key={f.id} className="config-custom-block">
              <div className="config-custom-field">
                <input placeholder="Nombre" value={f.label} onChange={e => updateField(f.id, 'label', e.target.value)} />
                <select value={f.type} onChange={e => updateField(f.id, 'type', e.target.value)}>
                  {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <button className="config-remove-field" onClick={() => removeField(f.id)}>✕</button>
              </div>
              {f.type === 'select' && (
                <div className="config-select-options">
                  {(f.options || []).map((o, oi) => (
                    <div key={oi} className="config-option-row">
                      <input value={o} onChange={e => updateOption(f.id, oi, e.target.value)} placeholder="Opción" />
                      <button className="config-remove-field" onClick={() => removeOption(f.id, oi)}>✕</button>
                    </div>
                  ))}
                  <button className="config-add-option" onClick={() => addOption(f.id)}>+ Agregar opción</button>
                </div>
              )}
            </div>
          ))}
          <button className="config-add-field" onClick={addField}>+ Agregar campo</button>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={save}>Guardar</button>
        </div>
      </div>
    </div>
  );
}
