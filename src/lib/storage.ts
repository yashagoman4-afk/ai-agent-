import AsyncStorage from '@react-native-async-storage/async-storage';

export interface RecordingEntry {
  id: string;
  createdAt: number;
  durationMs?: number;
  audioUri: string | null;
  rawTranscript: string;
  cleanedTranscript: string;
}

const STORAGE_KEY = 'voicenote.recordings';

export async function loadRecordings(): Promise<RecordingEntry[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as RecordingEntry[];
  } catch {
    return [];
  }
}

export async function saveRecording(entry: RecordingEntry): Promise<RecordingEntry[]> {
  const existing = await loadRecordings();
  const updated = [entry, ...existing];
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return updated;
}

export async function deleteRecording(id: string): Promise<RecordingEntry[]> {
  const existing = await loadRecordings();
  const updated = existing.filter((r) => r.id !== id);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return updated;
}
