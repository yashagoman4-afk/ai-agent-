import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { AudioModule, RecordingPresets, useAudioRecorder } from 'expo-audio';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ---------------------------------------------------------------------------
// Filler word removal
// ---------------------------------------------------------------------------

const FILLER_WORDS = [
  'you know',
  'i mean',
  'sort of',
  'kind of',
  'okay so',
  'so yeah',
  'um',
  'umm',
  'ummm',
  'uh',
  'uhh',
  'uhhh',
  'erm',
  'er',
  'hmm',
  'hmmm',
  'like',
  'basically',
  'actually',
  'literally',
  'right',
];

function removeFillerWords(text: string): string {
  if (!text) return text;
  const sorted = [...FILLER_WORDS].sort((a, b) => b.length - a.length);
  let result = text;
  for (const phrase of sorted) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(`\\b${escaped}\\b,?`, 'gi'), ' ');
  }
  return result
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,!?])/g, '$1')
    .trim()
    .replace(/^[a-z]/, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

interface Recording {
  id: string;
  createdAt: number;
  durationMs?: number;
  rawTranscript: string;
  cleanedTranscript: string;
}

const STORAGE_KEY = 'voicenote.recordings';

async function loadRecordings(): Promise<Recording[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as Recording[];
  } catch {
    return [];
  }
}

async function saveRecording(entry: Recording): Promise<Recording[]> {
  const existing = await loadRecordings();
  const updated = [entry, ...existing];
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return updated;
}

async function deleteRecording(id: string): Promise<Recording[]> {
  const existing = await loadRecordings();
  const updated = existing.filter((r) => r.id !== id);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return updated;
}

function formatDuration(ms?: number): string {
  if (!ms) return '';
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, '0')}`;
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------------------
// Record tab
// ---------------------------------------------------------------------------

function RecordTab({ onSaved }: { onSaved: () => void }) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [savedEntry, setSavedEntry] = useState<Recording | null>(null);
  const [error, setError] = useState<string | null>(null);
  const startedAt = useRef<number | null>(null);

  useSpeechRecognitionEvent('result', (event) => {
    setTranscript(event.results[0]?.transcript ?? '');
  });
  useSpeechRecognitionEvent('error', (event) => {
    setError(event.message ?? 'Speech recognition error');
  });

  const cleaned = useMemo(
    () => (savedEntry ? savedEntry.cleanedTranscript : removeFillerWords(transcript)),
    [savedEntry, transcript]
  );

  const start = useCallback(async () => {
    setError(null);
    setTranscript('');
    setSavedEntry(null);

    const mic = await AudioModule.requestRecordingPermissionsAsync();
    const speech = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!mic.granted || !speech.granted) {
      setError('Microphone or speech recognition permission was denied.');
      return;
    }

    await recorder.prepareToRecordAsync();
    recorder.record();
    ExpoSpeechRecognitionModule.start({ lang: 'en-US', interimResults: true, continuous: true });
    startedAt.current = Date.now();
    setRecording(true);
  }, [recorder]);

  const stop = useCallback(async () => {
    setBusy(true);
    ExpoSpeechRecognitionModule.stop();
    await recorder.stop();
    const durationMs = startedAt.current ? Date.now() - startedAt.current : undefined;
    startedAt.current = null;
    setRecording(false);

    const entry: Recording = {
      id: makeId(),
      createdAt: Date.now(),
      durationMs,
      rawTranscript: transcript,
      cleanedTranscript: removeFillerWords(transcript),
    };
    await saveRecording(entry);
    setSavedEntry(entry);
    setBusy(false);
    onSaved();
  }, [recorder, transcript, onSaved]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Voice Notes</Text>
      <Text style={styles.subtitle}>Record, transcribe, and clean up filler words automatically.</Text>

      <Pressable
        onPress={recording ? stop : start}
        style={[styles.recordButton, recording && styles.recordButtonActive]}
      >
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.recordButtonText}>{recording ? 'Stop' : 'Record'}</Text>}
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.card}>
        <Text style={styles.label}>Live transcript</Text>
        <Text style={styles.body}>{(savedEntry ? savedEntry.rawTranscript : transcript) || '—'}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Cleaned (filler words removed)</Text>
        <Text style={styles.body}>{cleaned || '—'}</Text>
      </View>

      {savedEntry ? <Text style={styles.saved}>Saved ✓</Text> : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// History tab
// ---------------------------------------------------------------------------

function HistoryTab({ refreshKey }: { refreshKey: number }) {
  const [entries, setEntries] = useState<Recording[]>([]);

  useMemo(() => {
    loadRecordings().then(setEntries);
    // refreshKey intentionally re-triggers this on save.
  }, [refreshKey]);

  const handleDelete = async (id: string) => {
    setEntries(await deleteRecording(id));
  };

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.container}
      data={entries}
      keyExtractor={(item) => item.id}
      ListEmptyComponent={<Text style={styles.empty}>No recordings yet. Go record something!</Text>}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.meta}>{new Date(item.createdAt).toLocaleString()}</Text>
            <Text style={styles.meta}>{formatDuration(item.durationMs)}</Text>
          </View>
          <Text style={styles.body}>{item.cleanedTranscript || '(no speech detected)'}</Text>
          <Pressable onPress={() => handleDelete(item.id)}>
            <Text style={styles.deleteText}>Delete</Text>
          </Pressable>
        </View>
      )}
    />
  );
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export default function App() {
  const [tab, setTab] = useState<'record' | 'history'>('record');
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      {tab === 'record' ? (
        <RecordTab onSaved={() => setRefreshKey((k) => k + 1)} />
      ) : (
        <HistoryTab refreshKey={refreshKey} />
      )}
      <View style={styles.tabBar}>
        <Pressable onPress={() => setTab('record')} style={styles.tabButton}>
          <Text style={[styles.tabLabel, tab === 'record' && styles.tabLabelActive]}>Record</Text>
        </Pressable>
        <Pressable onPress={() => setTab('history')} style={styles.tabButton}>
          <Text style={[styles.tabLabel, tab === 'history' && styles.tabLabelActive]}>History</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#0b0b10' },
  container: { flexGrow: 1, padding: 24, paddingTop: 48, gap: 16 },
  title: { fontSize: 28, fontWeight: '700', color: '#fff' },
  subtitle: { fontSize: 14, color: '#9a9aa5', marginBottom: 8 },
  recordButton: {
    alignSelf: 'center',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#e63946',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 16,
  },
  recordButtonActive: { backgroundColor: '#457b9d' },
  recordButtonText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  error: { color: '#ff6b6b', textAlign: 'center' },
  card: { backgroundColor: '#16161d', borderRadius: 12, padding: 16, gap: 8, marginBottom: 4 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { color: '#9a9aa5', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  meta: { color: '#9a9aa5', fontSize: 12 },
  body: { color: '#fff', fontSize: 16, lineHeight: 22 },
  saved: { color: '#2ecc71', textAlign: 'center', fontWeight: '600' },
  empty: { color: '#9a9aa5', textAlign: 'center', marginTop: 40 },
  deleteText: { color: '#ff6b6b', fontWeight: '600', alignSelf: 'flex-end' },
  list: { flex: 1 },
  tabBar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#26262f' },
  tabButton: { flex: 1, alignItems: 'center', paddingVertical: 14 },
  tabLabel: { color: '#6c6c78', fontWeight: '600' },
  tabLabelActive: { color: '#fff' },
});
