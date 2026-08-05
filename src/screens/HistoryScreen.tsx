import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { RecordingEntry, deleteRecording, loadRecordings } from '../lib/storage';

function formatDuration(ms?: number) {
  if (!ms) return '';
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export default function HistoryScreen() {
  const [entries, setEntries] = useState<RecordingEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRecordings().then((data) => {
      setEntries(data);
      setLoading(false);
    });
  }, []);

  const handleDelete = async (id: string) => {
    const updated = await deleteRecording(id);
    setEntries(updated);
  };

  if (loading) return null;

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.content}
      data={entries}
      keyExtractor={(item) => item.id}
      ListEmptyComponent={<Text style={styles.empty}>No recordings yet. Go record something!</Text>}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.date}>{new Date(item.createdAt).toLocaleString()}</Text>
            <Text style={styles.duration}>{formatDuration(item.durationMs)}</Text>
          </View>
          <Text style={styles.transcript}>{item.cleanedTranscript || '(no speech detected)'}</Text>
          <Pressable onPress={() => handleDelete(item.id)} style={styles.deleteButton}>
            <Text style={styles.deleteText}>Delete</Text>
          </Pressable>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: '#0b0b10' },
  content: { padding: 24, paddingTop: 64, gap: 12 },
  empty: { color: '#9a9aa5', textAlign: 'center', marginTop: 40 },
  card: { backgroundColor: '#16161d', borderRadius: 12, padding: 16, gap: 8 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  date: { color: '#9a9aa5', fontSize: 12 },
  duration: { color: '#9a9aa5', fontSize: 12 },
  transcript: { color: '#fff', fontSize: 15, lineHeight: 20 },
  deleteButton: { alignSelf: 'flex-end' },
  deleteText: { color: '#ff6b6b', fontWeight: '600' },
});
