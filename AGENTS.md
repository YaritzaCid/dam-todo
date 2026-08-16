# Alisto agent rules

# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v54.0.0/ before writing any Expo-related code.

## Project context

- App name: Alisto.
- Stack: Expo SDK 54, React Native 0.81, React 19, TypeScript, Expo Router.
- Package manager: Bun. Use `bun install`, `bun run <script>`, and keep `bun.lock` authoritative.
- Runtime target: Expo Go compatibility by default.
- Primary screen: `app/(tabs)/index.tsx` contains login, registration, welcome summary, todo board, MockAPI sync, and JSONPlaceholder import actions.
- Local persistence lives in `lib/alisto-db.ts`: SQLite on native platforms and `localStorage` fallback on web.
- Sync metadata lives in `todo_sync`/`syncRecords`; it tracks remote IDs, imports, and tombstones.
- Remote API code lives in `lib/remote-todo-api.ts`.
- Camera helpers live in `lib/todo-camera.ts`; GPS helpers live in `lib/todo-location.ts`.
- Validation rules live in `lib/validation-schemas.ts`.
- Visual direction: calm productivity board, warm cream base, deep green ink, rounded cards, and clear Spanish copy.

## Required documentation flow

- Use Context7 for current documentation whenever changing library/framework/API/SDK behavior.
- For Expo work, read Expo SDK 54 docs before editing code.
- For React Native UI behavior, prefer current React Native docs through Context7.

## UI rules

- Use `frontend-design` for visual redesigns.
- Keep login, registration, and todo copy in Spanish.
- Keep validation messages direct and action-oriented.
- Error messages must stand out in red.
- Success messages should remain green.
- Password visibility is controlled by the custom eye icon only; avoid native web password reveal controls.

## Expo Go compatibility

- Do not add `expo-dev-client` unless explicitly requested.
- Do not add native modules that require custom native builds without calling out the Expo Go impact.
- Prefer Expo SDK packages and React Native APIs that work inside Expo Go.

## Current app contract

- Email is required and must match a basic email pattern.
- Password is required and must have at least 6 characters.
- Missing password message must be exactly: `Faltan piezas: introduce contraseña`.
- Registration is functional and creates a local account.
- Passwords must never be stored as plaintext.
- A logged-in user sees only their own todos.
- Todos support create, complete/uncomplete, rename, delete, optional photo, and optional location.
- Camera uses `expo-camera`; native photo persistence uses `expo-file-system`; web/data URIs stay local.
- GPS uses `expo-location`; current location failure falls back to last-known location before error.
- Logging out must not delete saved todos.
- Remote todo sync reads only `process.env.EXPO_PUBLIC_REMOTE_TODOS_URL`; never hardcode the MockAPI URL in source.
- `.env` must stay gitignored.
- `.env.example` must stay versionable and document `EXPO_PUBLIC_REMOTE_TODOS_URL`.
- Remote API failures must not break local todo CRUD or login.
- MockAPI sync must process pending deletions before remote pull, so deleted todos cannot be reinserted.
- JSONPlaceholder imports must avoid duplicates for the current user and import at most 5 todos.
- Passwords, API URLs, and generated local IDs must not be logged except explicit non-secret diagnostics.

## Testing contract

- Jest uses `jest-expo`.
- Current automated suite: 13 tests across camera, GPS, API client, JSONPlaceholder import, and MockAPI sync.
- Tests must not depend on Internet, Expo Go, native emulator, or real device permissions.
- Mock `expo-camera`, `expo-location`, `expo-file-system`, `expo-crypto`, `expo-sqlite`, `fetch`, and `localStorage` where needed.
- Required verification after documentation or code changes:
  - `bun run test:ci`
  - `bun run tsc --noEmit`
  - `bun run lint`
  - `npx expo-doctor`
- For UI changes, smoke test the changed path in Expo Web or Expo Go when available.
- Stop any dev server started for verification before yielding.
