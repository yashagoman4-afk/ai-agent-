# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

A mobile app (Expo / React Native / TypeScript) that records your voice,
transcribes it to text on-device, and strips out filler words ("um", "uh",
"like", "you know", etc.) from the transcript.

## Commands

- `npm start` — start the Expo dev server
- `npm run android` / `npm run ios` / `npm run web` — run on a platform
- `npx tsc --noEmit` — type-check

No test runner is configured yet.

## Architecture

- `App.tsx` — root component, simple two-tab switcher (Record / History)
- `src/screens/RecordScreen.tsx` — record button, live + cleaned transcript
- `src/screens/HistoryScreen.tsx` — list of saved recordings
- `src/hooks/useVoiceRecorder.ts` — wraps `expo-audio` (recording) and
  `expo-speech-recognition` (on-device speech-to-text, no API key needed)
- `src/lib/fillerWords.ts` — regex-based filler word/phrase removal
- `src/lib/storage.ts` — persists recordings to `AsyncStorage`

Note: `expo-speech-recognition` requires a custom dev client / EAS build —
it will not work inside plain Expo Go.
