# Implementation Plan: Agent Translation App

**Branch**: `001-agent-translate` | **Date**: 2026-01-07 | **Spec**: `specs/001-agent-translate/spec.md`
**Input**: Feature specification from `specs/001-agent-translate/spec.md`

## Summary

Build a WSLg + Electron desktop app that captures selected text via a global
shortcut, sends it to a locally installed AI agent CLI for translation, and
shows source/translated text with copy actions. Users can configure prompts,
choose a target language, enable back-translation, select the agent command, and
review history stored locally. Performance targets emphasize fast translation
response and predictable error handling.

## TDD Outline (First Failing Tests)

- Shortcut capture + translation orchestration (main/core) fails before it passes.
- Settings application + agent payload composition fails before it passes.
- History persistence + UI selection fails before it passes.

## Technical Context

**Language/Version**: TypeScript 5.7 (ESM)
**Primary Dependencies**: Electron 33, React 18, electron-vite, node-sqlite3-wasm, zod
**AI Agent(s)**: Codex, Claude Code, GeminiCLI (local CLI tools; user-configured command)
**Storage**: Local SQLite (node-sqlite3-wasm)
**Testing**: Vitest + jsdom
**Target Platform**: WSLg (Linux) with Electron runtime
**Project Type**: Desktop app (Electron, multi-package)
**Performance Goals**: 95% of short translations (<=200 chars) displayed within 3s; 99% within 5s
**Constraints**: Global shortcut capture from active app, local CLI agent execution, deterministic agent selection
**Scale/Scope**: Single-user desktop app, history retention for last 100 entries

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] TDD plan defined: first failing tests identified per story, Red → Green → Refactor steps noted
- [x] Test strategy is unit-first with Vitest + jsdom; E2E only if critical and justified
- [x] Package boundaries respected (main/preload/renderer/core/shared) with IPC contracts in shared
- [x] Agent integration defined: target agent(s), CLI invocation, selection/fallback behavior
- [x] Flow schema changes (if any) follow forward-only rules and preserve unknown fields (N/A)
- [x] Secrets policy and local override rules acknowledged; no secrets in Flow/StateDB
- [x] Operational constraints reviewed (WSLg target, CLI auth, StateDB locking, approvals)
- [x] Quality gates planned: `npm run test`, `npm run lint`, `npm run format`

## Project Structure

### Documentation (this feature)

```text
specs/001-agent-translate/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
packages/
├── main/src/            # global shortcut, clipboard capture, agent exec, IPC handlers
├── preload/src/         # contextBridge API for renderer
├── renderer/src/        # UI (translation view, settings, history)
├── core/src/            # domain logic, agent adapter, history repository
└── shared/src/          # shared types and IPC contracts
```

**Structure Decision**: Use the existing multi-package Electron layout. Platform
interactions live in `packages/main`, UI in `packages/renderer`, domain logic in
`packages/core`, IPC/types in `packages/shared`, and the preload bridge in
`packages/preload`.

## Complexity Tracking

No constitutional violations identified.

## Phase 0: Research (Output: research.md)

- Validate global shortcut + clipboard capture strategy in WSLg
- Define agent CLI invocation contract (stdin/stdout JSON)
- Confirm history retention and ordering strategy
- Define timeout/error handling strategy aligned to performance criteria

## Phase 1: Design & Contracts (Outputs: data-model.md, contracts/, quickstart.md)

- Define entities and validation for history, prompts, and agent config
- Update translation/settings/history IPC contracts
- Draft quickstart flow for shortcut → translation → history

## Constitution Check (Post-Design)

- [x] All gates still satisfied after Phase 1 design artifacts
