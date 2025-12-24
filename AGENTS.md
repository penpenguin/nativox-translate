# Repository Guidelines

## Project Structure & Module Organization

- `packages/main/`: Electron main process (IPC, app lifecycle).
- `packages/preload/`: contextBridge API for renderer.
- `packages/renderer/`: UI entry (`index.html`, `src/main.ts`).
- `packages/core/`: domain logic (FlowStore, StateDB, ProcessManager, approval).
- `packages/shared/`: shared types, IPC contracts, and errors.
- Tests live alongside code as `*.test.ts` in each package.
- Specs live under `.kiro/specs/` (requirements/design/task list).

## Build, Test, and Development Commands

- `npm run dev`: start Electron + Vite dev server (WSLg). Uses port `5174`.
- `npm run build`: production build for main/preload/renderer.
- `npm run preview`: preview renderer build.
- `npm run test`: run Vitest in jsdom.
- `npm run lint`: ESLint across the repo.
- `npm run format`: Prettier formatting.

## Coding Style & Naming Conventions

- TypeScript, ESM (`type: module`).
- Indentation: 2 spaces; semicolons omitted.
- File names: `camelCase.ts` for modules, `*.test.ts` for tests.
- Lint/format: ESLint + Prettier (run via `npm run lint` / `npm run format`).

## Testing Guidelines

- Framework: Vitest + jsdom.
- Naming: `packages/**/src/*.test.ts`.
- Prefer small unit tests; add higher-level tests only when critical.
- Run all tests with `npm run test`.

## Commit & Pull Request Guidelines

- Commit messages are short, imperative, sentence-case (e.g., "Set up P0 foundation and dev boot").
- Keep commits focused on one logical change.
- For PRs: include a summary, test evidence (commands + result), and any relevant screenshots for UI changes.

## Security & Configuration Tips

- Local overrides live in `.lumberjack/local/` and are git-ignored.
- Do not store secrets in Flow JSON or the StateDB; use existing CLI auth.
