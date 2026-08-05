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

Everything lives in a single `App.tsx`:

- `RecordTab` — records audio + live-transcribes via `expo-audio` and
  `expo-speech-recognition` (on-device, no API key needed)
- `removeFillerWords` — regex-based filler word/phrase removal
- `HistoryTab` — lists/deletes saved recordings
- Recordings persist to `AsyncStorage`

Note: `expo-speech-recognition` requires a custom dev client / EAS build —
it will not work inside plain Expo Go.
