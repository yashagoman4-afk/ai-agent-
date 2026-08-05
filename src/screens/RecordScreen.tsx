import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useVoiceRecorder } from '../hooks/useVoiceRecorder';
import { removeFillerWords } from '../lib/fillerWords';
import { RecordingEntry, saveRecording } from '../lib/storage';

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function RecordScreen() {
  const { status, transcript, error, start, stop } = useVoiceRecorder();
  const [lastEntry, setLastEntry] = useState<RecordingEntry | null>(null);
  const [saving, setSaving] = useState(false);

  const isRecording = status === 'recording';
  const rawText = lastEntry ? lastEntry.rawTranscript : transcript;
  const cleanedText = lastEntry ? lastEntry.cleanedTranscript : removeFillerWords(transcript);

  const handlePress = async () => {
    if (isRecording) {
      const result = await stop();
      const entry: RecordingEntry = {
        id: makeId(),
        createdAt: Date.now(),
        durationMs: result.durationMs,
        audioUri: result.audioUri,
        rawTranscript: result.transcript,
        cleanedTranscript: removeFillerWords(result.transcript),
      };
      setLastEntry(entry);
      setSaving(true);
      await saveRecording(entry);
      setSaving(false);
      return;
    }

    setLastEntry(null);
    await start();
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Voice Notes</Text>
      <Text style={styles.subtitle}>Record, transcribe, and clean up filler words automatically.</Text>

      <Pressable onPress={handlePress} style={[styles.recordButton, isRecording && styles.recordButtonActive]}>
        {status === 'stopping' ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.recordButtonText}>{isRecording ? 'Stop' : 'Record'}</Text>
        )}
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.transcriptBox}>
        <Text style={styles.label}>Live transcript</Text>
        <Text style={styles.transcriptText}>{rawText || '—'}</Text>
      </View>

      <View style={styles.transcriptBox}>
        <Text style={styles.label}>Cleaned (filler words removed)</Text>
        <Text style={styles.transcriptText}>{cleanedText || '—'}</Text>
      </View>

      {saving ? <Text style={styles.saved}>Saving…</Text> : null}
      {!saving && lastEntry ? <Text style={styles.saved}>Saved ✓</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, paddingTop: 64, gap: 16, backgroundColor: '#0b0b10' },
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
  transcriptBox: { backgroundColor: '#16161d', borderRadius: 12, padding: 16, gap: 8 },
  label: { color: '#9a9aa5', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  transcriptText: { color: '#fff', fontSize: 16, lineHeight: 22 },
  saved: { color: '#2ecc71', textAlign: 'center', fontWeight: '600' },
});
