import { useCallback, useRef, useState } from 'react';
import { AudioModule, RecordingPresets, useAudioRecorder } from 'expo-audio';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';

export type RecordingStatus = 'idle' | 'recording' | 'stopping';

export interface RecordResult {
  audioUri: string | null;
  transcript: string;
  durationMs?: number;
}

/**
 * Records audio and transcribes it live using on-device speech
 * recognition (no API key / cloud service required).
 */
export function useVoiceRecorder() {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [status, setStatus] = useState<RecordingStatus>('idle');
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const startedAtRef = useRef<number | null>(null);

  useSpeechRecognitionEvent('result', (event) => {
    setTranscript(event.results[0]?.transcript ?? '');
  });

  useSpeechRecognitionEvent('error', (event) => {
    setError(event.message ?? 'Speech recognition error');
  });

  const start = useCallback(async () => {
    setError(null);
    setTranscript('');

    const audioPermission = await AudioModule.requestRecordingPermissionsAsync();
    const speechPermission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();

    if (!audioPermission.granted || !speechPermission.granted) {
      setError('Microphone or speech recognition permission was denied.');
      return false;
    }

    await recorder.prepareToRecordAsync();
    recorder.record();

    ExpoSpeechRecognitionModule.start({
      lang: 'en-US',
      interimResults: true,
      continuous: true,
    });

    startedAtRef.current = Date.now();
    setStatus('recording');
    return true;
  }, [recorder]);

  const stop = useCallback(async (): Promise<RecordResult> => {
    setStatus('stopping');
    ExpoSpeechRecognitionModule.stop();
    await recorder.stop();

    const durationMs = startedAtRef.current ? Date.now() - startedAtRef.current : undefined;
    startedAtRef.current = null;
    setStatus('idle');

    return {
      audioUri: recorder.uri ?? null,
      transcript,
      durationMs,
    };
  }, [recorder, transcript]);

  return { status, transcript, error, start, stop };
}
