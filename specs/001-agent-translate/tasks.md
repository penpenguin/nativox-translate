---

description: "Task list for Agent Translation App"
---

# Tasks: Agent Translation App

**Input**: Design documents from `/specs/001-agent-translate/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Tests are REQUIRED for all code changes per the constitution. Write tests first, confirm they fail, then implement.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Nativox Translate (default)**: `packages/main/src/`, `packages/preload/src/`,
  `packages/renderer/src/`, `packages/core/src/`, `packages/shared/src/`
  with tests in `packages/**/src/*.test.ts`

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [X] T001 Create translation module barrels in /home/user/repository/nativox-translate/.worktrees/huge-changes/packages/core/src/translation/index.ts
- [X] T002 Create translation module barrels in /home/user/repository/nativox-translate/.worktrees/huge-changes/packages/shared/src/translation/index.ts
- [X] T003 Create translation module barrels in /home/user/repository/nativox-translate/.worktrees/huge-changes/packages/main/src/translation/index.ts
- [X] T004 Create translation module barrels in /home/user/repository/nativox-translate/.worktrees/huge-changes/packages/renderer/src/features/translation/index.tsx
- [X] T005 Export translation modules from /home/user/repository/nativox-translate/.worktrees/huge-changes/packages/shared/src/index.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T006 [P] Unit test for agent exec timeout/parse in /home/user/repository/nativox-translate/.worktrees/huge-changes/packages/main/src/translation/agentExec.test.ts
- [X] T007 [P] Unit test for selection capture flow in /home/user/repository/nativox-translate/.worktrees/huge-changes/packages/main/src/translation/selectionCapture.test.ts
- [X] T008 [P] Unit test for translation service success path in /home/user/repository/nativox-translate/.worktrees/huge-changes/packages/core/src/translation/translationService.test.ts
- [X] T009 Define translation domain types in /home/user/repository/nativox-translate/.worktrees/huge-changes/packages/shared/src/translation/types.ts
- [X] T010 Define IPC channels and payloads for translation/settings/history in /home/user/repository/nativox-translate/.worktrees/huge-changes/packages/shared/src/translation/ipc.ts
- [X] T011 Implement agent adapter interface in /home/user/repository/nativox-translate/.worktrees/huge-changes/packages/core/src/translation/agentAdapter.ts
- [X] T012 Implement agent command executor with JSON stdin/stdout + timeout in /home/user/repository/nativox-translate/.worktrees/huge-changes/packages/main/src/translation/agentExec.ts
- [X] T013 Implement selection capture + clipboard restore in /home/user/repository/nativox-translate/.worktrees/huge-changes/packages/main/src/translation/selectionCapture.ts
- [X] T014 Implement translation orchestration in /home/user/repository/nativox-translate/.worktrees/huge-changes/packages/core/src/translation/translationService.ts
- [X] T015 Implement translation IPC handlers in /home/user/repository/nativox-translate/.worktrees/huge-changes/packages/main/src/translation/ipcHandlers.ts
- [X] T016 Implement preload bridge API for translation in /home/user/repository/nativox-translate/.worktrees/huge-changes/packages/preload/src/translation.ts
- [X] T017 Implement renderer API client for translation in /home/user/repository/nativox-translate/.worktrees/huge-changes/packages/renderer/src/features/translation/api.ts

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Shortcut Translation (Priority: P1) 🎯 MVP

**Goal**: Translate selected text via shortcut and display source/translated text with copy buttons.

**Independent Test**: Trigger shortcut with selected text and verify UI shows both texts and copy actions.

### Tests for User Story 1 (REQUIRED - write first, expect failure) ⚠️

- [X] T018 [US1] Renderer test for source/translated view + copy + SC-003 timing (shortcut→copy, fake timers) in /home/user/repository/nativox-translate/.worktrees/huge-changes/packages/renderer/src/features/translation/TranslationView.test.tsx
- [X] T019 [US1] Renderer test for error banner (title/cause/retry) in /home/user/repository/nativox-translate/.worktrees/huge-changes/packages/renderer/src/features/translation/TranslationView.test.tsx

### Implementation for User Story 1

- [X] T020 [P] [US1] Implement global shortcut registration in /home/user/repository/nativox-translate/.worktrees/huge-changes/packages/main/src/translation/shortcut.ts
- [X] T021 [US1] Implement shortcut handler to capture selection and invoke translation in /home/user/repository/nativox-translate/.worktrees/huge-changes/packages/main/src/translation/translationController.ts
- [X] T022 [P] [US1] Implement translation view UI with copy buttons in /home/user/repository/nativox-translate/.worktrees/huge-changes/packages/renderer/src/features/translation/TranslationView.tsx
- [X] T023 [US1] Wire translation view to IPC API in /home/user/repository/nativox-translate/.worktrees/huge-changes/packages/renderer/src/features/translation/translationStore.ts
- [X] T024 [US1] Add top-of-screen error banner with retry action in /home/user/repository/nativox-translate/.worktrees/huge-changes/packages/renderer/src/features/translation/TranslationView.tsx

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently

---

## Phase 4: User Story 2 - Prompt and Language Control (Priority: P2)

**Goal**: Configure prompts, target language, back-translation behavior, and agent command selection.

**Independent Test**: Apply settings, run translation, and confirm outputs match configured prompts and toggles.

### Tests for User Story 2 (REQUIRED - write first, expect failure) ⚠️

- [X] T025 [P] [US2] Unit test for settings application in /home/user/repository/nativox-translate/.worktrees/huge-changes/packages/core/src/translation/settingsService.test.ts
- [X] T026 [P] [US2] Unit test for agent payload with prompts/command in /home/user/repository/nativox-translate/.worktrees/huge-changes/packages/core/src/translation/agentAdapter.test.ts
- [X] T027 [P] [US2] Unit test for agent config selection rule (isDefault/updatedAt) in /home/user/repository/nativox-translate/.worktrees/huge-changes/packages/core/src/translation/agentConfigRepository.test.ts
- [X] T028 [P] [US2] Renderer test for settings form in /home/user/repository/nativox-translate/.worktrees/huge-changes/packages/renderer/src/features/translation/SettingsView.test.tsx

### Implementation for User Story 2

- [X] T029 [P] [US2] Implement settings storage (prompts/language/back-translation) in /home/user/repository/nativox-translate/.worktrees/huge-changes/packages/core/src/translation/settingsService.ts
- [X] T030 [P] [US2] Implement agent config persistence + selection rule in /home/user/repository/nativox-translate/.worktrees/huge-changes/packages/core/src/translation/agentConfigRepository.ts
- [X] T031 [US2] Extend IPC handlers for settings/agent config in /home/user/repository/nativox-translate/.worktrees/huge-changes/packages/main/src/translation/ipcHandlers.ts
- [X] T032 [US2] Extend preload bridge API for settings/agent config in /home/user/repository/nativox-translate/.worktrees/huge-changes/packages/preload/src/translation.ts
- [X] T033 [US2] Extend renderer API client for settings/agent config in /home/user/repository/nativox-translate/.worktrees/huge-changes/packages/renderer/src/features/translation/api.ts
- [X] T034 [P] [US2] Implement settings UI (prompts, target language, agent command) in /home/user/repository/nativox-translate/.worktrees/huge-changes/packages/renderer/src/features/translation/SettingsView.tsx
- [X] T035 [US2] Apply settings + agent command to translation requests in /home/user/repository/nativox-translate/.worktrees/huge-changes/packages/core/src/translation/translationService.ts
- [X] T036 [US2] Render back-translation in /home/user/repository/nativox-translate/.worktrees/huge-changes/packages/renderer/src/features/translation/TranslationView.tsx

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently

---

## Phase 5: User Story 3 - Translation History (Priority: P3)

**Goal**: Persist and display translation history with selection and copy support.

**Independent Test**: Create translations, restart the app, and verify history persists and is selectable.

### Tests for User Story 3 (REQUIRED - write first, expect failure) ⚠️

- [X] T037 [US3] Unit test for history repository CRUD in /home/user/repository/nativox-translate/.worktrees/huge-changes/packages/core/src/translation/historyRepository.test.ts
- [X] T038 [US3] Unit test for history retention limit (last 100 entries) in /home/user/repository/nativox-translate/.worktrees/huge-changes/packages/core/src/translation/historyRepository.test.ts
- [X] T039 [US3] Renderer test for history list + selection in /home/user/repository/nativox-translate/.worktrees/huge-changes/packages/renderer/src/features/translation/HistoryView.test.tsx
- [X] T040 [US3] Renderer test for reverse chronological ordering in /home/user/repository/nativox-translate/.worktrees/huge-changes/packages/renderer/src/features/translation/HistoryView.test.tsx

### Implementation for User Story 3

- [X] T041 [P] [US3] Implement SQLite history repository in /home/user/repository/nativox-translate/.worktrees/huge-changes/packages/core/src/translation/historyRepository.ts
- [X] T042 [US3] Append translation results to history (retain last 100, newest first) in /home/user/repository/nativox-translate/.worktrees/huge-changes/packages/core/src/translation/translationService.ts
- [X] T043 [P] [US3] Implement history UI list in /home/user/repository/nativox-translate/.worktrees/huge-changes/packages/renderer/src/features/translation/HistoryView.tsx
- [X] T044 [US3] Extend IPC handlers for history in /home/user/repository/nativox-translate/.worktrees/huge-changes/packages/main/src/translation/ipcHandlers.ts
- [X] T045 [US3] Extend preload bridge API for history in /home/user/repository/nativox-translate/.worktrees/huge-changes/packages/preload/src/translation.ts
- [X] T046 [US3] Extend renderer API client for history in /home/user/repository/nativox-translate/.worktrees/huge-changes/packages/renderer/src/features/translation/api.ts

**Checkpoint**: All user stories should now be independently functional

---

## Phase N: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [X] T047 [P] Add translation timing metrics in /home/user/repository/nativox-translate/.worktrees/huge-changes/packages/core/src/translation/translationService.ts
- [X] T048 [P] Add performance threshold verification tests (<=3s/<=5s) in /home/user/repository/nativox-translate/.worktrees/huge-changes/packages/core/src/translation/performanceCriteria.test.ts
- [X] T049 [P] Add error mapping helpers in /home/user/repository/nativox-translate/.worktrees/huge-changes/packages/core/src/translation/errors.ts
- [X] T050 [P] Update user help text in /home/user/repository/nativox-translate/.worktrees/huge-changes/packages/renderer/src/features/translation/SettingsView.tsx
- [X] T051 [P] Update docs for shortcut usage in /home/user/repository/nativox-translate/.worktrees/huge-changes/specs/001-agent-translate/quickstart.md

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: Depend on Foundational phase completion
  - User stories can proceed in priority order (P1 → P2 → P3)
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Base translation flow; no dependencies
- **User Story 2 (P2)**: Depends on US1 translation flow
- **User Story 3 (P3)**: Depends on US1 translation flow (history built from results)

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Models/services before UI integration
- Core implementation before IPC wiring
- Story complete before moving to next priority

### Parallel Opportunities

- Foundational tests T006–T008 can run in parallel
- Tests within a user story marked [P] can run in parallel
- UI tasks in renderer can run in parallel with core tasks when IPC contracts are stable

---

## Parallel Example: User Story 1

```bash
# Launch all tests for User Story 1 together:
Task: "Renderer test for source/translated view + copy in /home/user/repository/nativox-translate/.worktrees/huge-changes/packages/renderer/src/features/translation/TranslationView.test.tsx"
Task: "Renderer test for error banner (title/cause/retry) in /home/user/repository/nativox-translate/.worktrees/huge-changes/packages/renderer/src/features/translation/TranslationView.test.tsx"

# Launch UI + main tasks in parallel (after core contracts are set):
Task: "Implement global shortcut registration in /home/user/repository/nativox-translate/.worktrees/huge-changes/packages/main/src/translation/shortcut.ts"
Task: "Implement translation view UI with copy buttons in /home/user/repository/nativox-translate/.worktrees/huge-changes/packages/renderer/src/features/translation/TranslationView.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test User Story 1 independently

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently
3. Add User Story 2 → Test independently
4. Add User Story 3 → Test independently

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1
   - Developer B: User Story 2
   - Developer C: User Story 3
3. Stories complete and integrate independently
