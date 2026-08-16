# Alisto agent rules

# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v54.0.0/ before writing any Expo-related code.

## Project context

- App name: Alisto.
- Stack: Expo SDK 54, React Native 0.81, React 19, TypeScript, Expo Router.
- Package manager: Bun. Use `bun install`, `bun run <script>`, and keep `bun.lock` authoritative.
- Runtime target: Expo Go compatibility by default.
- Primary screen: `app/(tabs)/index.tsx` contains login, registration, welcome summary, and the todo board.
- Local persistence lives in `lib/alisto-db.ts`: SQLite on native platforms and `localStorage` fallback on web.
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
- Logging out must not delete saved todos.
- Remote todo sync reads only `process.env.EXPO_PUBLIC_REMOTE_TODOS_URL`; never hardcode the MockAPI URL in source.
- `.env` must stay gitignored.
- Remote API failures must not break local todo CRUD or login.
- JSONPlaceholder imports must avoid duplicates for the current user.

## Verification

- Run `bun run lint` after permanent code changes.
- For UI changes, smoke test the changed path in Expo Web or Expo Go when available.
- Stop any dev server started for verification before yielding.
