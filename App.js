import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, TextInput, View, Button, Platform, Alert } from 'react-native';
import * as Notifications from 'expo-notifications';
import { db, getCurrentMateria, initDB, getFirstSync, updateSync, addSync } from './db';
import { useEffect, useState } from 'react';
import { initSync, isSyncConnected, fullSync } from './sync';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function App() {
  const [materias, setMaterias] = useState([]);
  const [materiaActual, setMateriaActual] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [datos, setDatos] = useState({});
  const [syncStatus, setSyncStatus] = useState('off');
  const [syncMsg, setSyncMsg] = useState('');

  useEffect(() => {
    initDB();
    cargarMaterias();
    solicitarPermisos();

    const ok = initSync();
    setSyncStatus(ok ? 'connected' : 'off');
  }, []);

  useEffect(() => {
    if (syncStatus !== 'connected') return;
    const doAutoSync = async () => {
      setSyncMsg('Sincronizando...');
      const r = await fullSync(msg => setSyncMsg(msg));
      if (r.ok) {
        setSyncStatus('connected');
        setSyncMsg(`✅ ${r.pushed} subidos · ${r.pulled} bajados`);
        await cargarMaterias();
      } else {
        setSyncStatus('error');
        setSyncMsg(`❌ ${r.error || 'Error de sync'}`);
      }
    };
    const timer = setTimeout(doAutoSync, 3000);
    return () => clearTimeout(timer);
  }, [syncStatus]);

  const cargarMaterias = async () => {
    const todas = await db.getAllSync('materias');
    setMaterias(todas);
    const actual = getCurrentMateria(todas);
    setMateriaActual(actual);
    if (actual) {
      setExpandedId(actual.id);
      programarNotificacion(actual);
    }
  };

  const solicitarPermisos = async () => {
    if (Platform.OS === 'android') {
      await Notifications.requestPermissionsAsync();
    }
  };

  const programarNotificacion = async (materia) => {
    if (Platform.OS !== 'android') return;
    await Notifications.cancelAllScheduledNotificationsAsync();
    
    const ahora = new Date();
    const [h, m] = materia.horaFin.split(':').map(Number);
    const fechaNotif = new Date(ahora);
    fechaNotif.setHours(h, m + 1, 0, 0);
    
    if (fechaNotif > ahora) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Daily Log',
          body: 'Clase de ' + materia.nombre + ' finalizada. Completá tu registro.',
          data: { materiaId: materia.id },
        },
        trigger: {
          type: 'date',
          date: fechaNotif,
        },
      });
    }
  };

  const updateDato = async (materiaId, campo, valor) => {
    setDatos(prev => ({
      ...prev,
      [materiaId]: { ...prev[materiaId], [campo]: valor }
    }));
    const fecha = new Date().toLocaleDateString('es-ES');
    const existente = await getFirstSync('logs', { materiaId, fecha });
    if (existente) {
      await updateSync('logs', existente.id, { [campo]: valor });
    } else {
      await addSync('logs', {
        materiaId,
        fecha,
        ejercicios: '',
        tiempo: '',
        tema: '',
        energia: 3,
        distraccion: 3,
        nota: '',
        [campo]: valor
      });
    }
  };

  const generarOutput = () => {
    const fecha = new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    let texto = 'Daily Log — ' + fecha + '\n\n';
    materias.forEach(m => {
      const d = datos[m.id] || {};
      if (d.ejercicios || d.tiempo || d.tema || d.nota) {
        texto += m.emoji + ' ' + m.nombre + '\n';
        if (d.ejercicios) texto += '├─ Ejercicios: ' + d.ejercicios + '\n';
        if (d.tiempo) texto += '├─ Tiempo: ' + d.tiempo + ' min\n';
        if (d.tema) texto += '├─ Tema: ' + d.tema + '\n';
        texto += '├─ Energía: ' + d.energia + '/5\n';
        texto += '├─ Distracción: ' + d.distraccion + '/5\n';
        if (d.nota) texto += '└─ Nota: ' + d.nota + '\n';
        texto += '\n';
      }
    });
    alert(texto.trim());
  };

  return (
    <View style={styles.container}>
      <StatusBar style="auto" />
      <View style={styles.header}>
        <Text style={styles.h1}>Daily Log</Text>
        {materiaActual && (
          <Text style={styles.badge}>AHORA: {materiaActual.nombre}</Text>
        )}
      </View>

      <View style={styles.list}>
        {materias.map(m => {
          const isExpanded = expandedId === m.id;
          const esActual = materiaActual && materiaActual.id === m.id;
          const d = datos[m.id] || {};
          
          return (
            <View key={m.id} style={[styles.card, esActual && styles.cardActual]}>
              <View style={styles.cardHeader}>
                <Text style={styles.emoji}>{m.emoji}</Text>
                <Text style={styles.nombre}>{m.nombre}</Text>
                <Button title={isExpanded ? '−' : '+'} onPress={() => setExpandedId(isExpanded ? null : m.id)} />
              </View>

              {isExpanded && (
                <View style={styles.cardBody}>
                  <Text style={styles.info}>{m.dia} · {m.horaInicio}-{m.horaFin} · {m.ubicacion}</Text>
                 
                  <View style={styles.row}>
                    <View style={styles.campo}>
                      <Text>Ejercicios</Text>
                      <TextInput
                        style={styles.input}
                        value={d.ejercicios || ''}
                        onChangeText={(val) => updateDato(m.id, 'ejercicios', val)}
                        placeholder="0"
                        keyboardType="numeric"
                      />
                    </View>
                    <View style={styles.campo}>
                      <Text>Tiempo (min)</Text>
                      <TextInput
                        style={styles.input}
                        value={d.tiempo || ''}
                        onChangeText={(val) => updateDato(m.id, 'tiempo', val)}
                        placeholder="0"
                        keyboardType="numeric"
                      />
                    </View>
                  </View>

                  <View style={styles.campo}>
                    <Text>Tema específico</Text>
                    <TextInput
                      style={styles.input}
                      value={d.tema || ''}
                      onChangeText={(val) => updateDato(m.id, 'tema', val)}
                      placeholder="Ej: Límites, derivadas..."
                    />
                  </View>

                  <View style={styles.campo}>
                    <Text>Anotaciones</Text>
                    <TextInput
                      style={[styles.input, styles.textarea]}
                      value={d.nota || ''}
                      onChangeText={(val) => updateDato(m.id, 'nota', val)}
                      placeholder="Notas, dudas, observaciones..."
                      multiline={true}
                      numberOfLines={3}
                    />
                  </View>
                </View>
              )}
            </View>
          );
        })}
      </View>

      {(syncMsg !== '') && (
        <Text style={styles.syncMsg}>{syncMsg}</Text>
      )}
      <View style={styles.footer}>
        <Button title="Generar Output" onPress={generarOutput} />
        <View style={{ marginTop: 8 }}>
          <Button
            title={
              syncStatus === 'syncing' ? 'Sincronizando...' :
              syncStatus === 'connected' ? 'Sync manual' :
              syncStatus === 'error' ? 'Reconectar' : 'Sin conexión'
            }
            onPress={async () => {
              setSyncStatus('syncing');
              setSyncMsg('Sincronizando...');
              const r = await fullSync(msg => setSyncMsg(msg));
              setSyncStatus(r.ok ? 'connected' : 'error');
              setSyncMsg(r.ok ? `✅ ${r.pushed} subidos · ${r.pulled} bajados` : `❌ ${r.error || 'Error'}`);
              if (r.ok) await cargarMaterias();
            }}
            disabled={syncStatus === 'syncing'}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0c',
    padding: 20,
  },
  header: {
    marginBottom: 20,
  },
  h1: {
    fontSize: 28,
    fontFamily: 'serif',
    color: '#f4f4f5',
  },
  badge: {
    backgroundColor: 'rgba(129,140,248,0.15)',
    padding: 8,
    borderRadius: 8,
    color: '#818cf8',
    fontWeight: '600',
    marginTop: 8,
  },
  list: {
    flex: 1,
  },
  card: {
    backgroundColor: '#131316',
    borderWidth: 1,
    borderColor: '#2a2a30',
    borderRadius: 14,
    marginBottom: 10,
    overflow: 'hidden',
  },
  cardActual: {
    borderColor: '#818cf8',
    shadowColor: '#818cf8',
    shadowOpacity: 0.3,
    elevation: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  emoji: {
    fontSize: 24,
    width: 38,
    height: 38,
    textAlign: 'center',
    backgroundColor: '#1a1a1f',
    borderRadius: 6,
    lineHeight: 38,
  },
  nombre: {
    flex: 1,
    fontSize: 15,
    color: '#f4f4f5',
  },
  cardBody: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#2a2a30',
    gap: 14,
  },
  info: {
    fontSize: 12,
    color: '#71717a',
    textAlign: 'center',
    backgroundColor: '#1a1a1f',
    padding: 8,
    borderRadius: 6,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  campo: {
    flex: 1,
    gap: 6,
  },
  input: {
    backgroundColor: '#0f0f12',
    borderWidth: 1,
    borderColor: '#2a2a30',
    borderRadius: 10,
    padding: 10,
    color: '#f4f4f5',
    fontSize: 14,
  },
  textarea: {
    height: 60,
    textAlignVertical: 'top',
  },
  syncMsg: {
    fontSize: 11,
    color: '#71717a',
    textAlign: 'center',
    marginTop: 12,
  },
  footer: {
    marginTop: 12,
  },
});