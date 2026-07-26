# Piezario agent rules

# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v54.0.0/ before writing any Expo-related code.

## Project context

- App name: Piezario.
- Stack: Expo SDK 54, React Native 0.81, React 19, TypeScript, Expo Router.
- Package manager: Bun. Use `bun install`, `bun run <script>`, and keep `bun.lock` authoritative.
- Runtime target: Expo Go compatibility by default.
- Primary screen: `app/(tabs)/index.tsx` contains the login view.
- Visual direction: puzzle-board identity with warm cream base, violet ink, coral/mustard/turquoise puzzle pieces, and copy based on pieces fitting together.

## Required documentation flow

- Use Context7 for current documentation whenever changing library/framework/API/SDK behavior.
- For Expo work, read Expo SDK 54 docs before editing code.
- For React Native UI behavior, prefer current React Native docs through Context7.

## UI rules

- Use `frontend-design` for visual redesigns.
- Preserve the Piezario puzzle metaphor unless the product direction changes explicitly.
- Keep login copy in Spanish.
- Keep validation messages direct and action-oriented.
- Error messages must stand out in red.
- Success messages should remain green.
- Registration is currently visible but non-functional; do not wire navigation/auth until requested.

## Expo Go compatibility

- Do not add `expo-dev-client` unless explicitly requested.
- Do not add native modules that require custom native builds without calling out the Expo Go impact.
- Prefer Expo SDK packages and React Native APIs that work inside Expo Go.

## Verification

- Run `bun run lint` after permanent code changes.
- For UI changes, smoke test the changed path in Expo Web or Expo Go when available.
- Stop any dev server started for verification before yielding.

## Current login contract

- Email is required and must match a basic email pattern.
- Password is required and must have at least 6 characters.
- Missing password message must be exactly: `Faltan piezas: introduce contraseña`.
- Password visibility is controlled by the custom eye icon only; avoid native web password reveal controls.
