# Feature Specification: Agent Translation App

**Feature Branch**: `001-agent-translate`  
**Created**: 2026-01-06  
**Status**: Draft  
**Input**: User description: "WSL上で動かし、wslgでGUIを提供。 Electronを使用。 ショートカットに反応して、ブラウザやアプリで選択されているテキストを読み込んで、環境にあるAIAgentへexecなどで渡す。翻訳結果をアプリに表示する。 翻訳用のシステムプロンプトと、カスタムプロンプトを設定可能。 翻訳先の言語を指定でき、返し翻訳も行う。 画面には、翻訳履歴を表示する。 翻訳履歴はnode-sqlite3-wasmを使用する。パフォーマンス重視で、翻訳結果返却までのスピードを重視。 Agentの起動コマンドを使用して、翻訳するモデルを決定する。画面上では、翻訳前のテキスト、翻訳後のテキストをそれぞれ表示し、それぞれコピーボタンを付ける。"

## Clarifications

### Session 2026-01-07
- Q: 複数のエージェント設定がある場合の決定的選択ルールは？ → A: isDefault は1件のみ許可。複数 isDefault の場合は最終更新が勝つ。
- Q: エラー表示の最小要件は？ → A: 画面上部に明示エラーバナー（見出し＋原因＋再試行）。
- Q: SC-003 の測定開始/終了条件は？ → A: 開始=ショートカット押下、終了=翻訳結果表示＋コピーボタン押下完了。

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Shortcut Translation (Priority: P1)

User selects text in a browser or app, presses a global shortcut, and sees the
source text and translated text in the app with copy buttons for each.

**Why this priority**: This is the core value: fast translation from any app.

**Independent Test**: Can be fully tested by simulating a selected text input,
triggering the shortcut, and verifying the app displays both texts with copy
actions.

**Acceptance Scenarios**:

1. **Given** text is selected in the active app, **When** the user presses the
   shortcut, **Then** the app captures the selected text and shows both source
   and translated text.
2. **Given** a translation result is displayed, **When** the user clicks copy on
   either field, **Then** the corresponding text is placed on the clipboard.

---

### User Story 2 - Prompt and Language Control (Priority: P2)

User configures a system prompt and custom prompt, chooses a target language,
optionally enables back-translation, selects the agent command, and translations
reflect those settings.

**Why this priority**: Users need control over tone, instruction, and language.

**Independent Test**: Can be tested by applying settings and confirming that
agent requests incorporate those settings and the UI shows back-translation
when enabled.

**Acceptance Scenarios**:

1. **Given** prompts and target language are set, **When** a translation runs,
   **Then** the result reflects the configured prompts and target language.
2. **Given** back-translation is enabled, **When** a translation completes,
   **Then** the UI displays the back-translation alongside the main output.
3. **Given** an agent command is configured, **When** a translation runs,
   **Then** the system uses that command for the translation request.

---

### User Story 3 - Translation History (Priority: P3)

User views a history list of past translations and can revisit and copy past
source/translated texts.

**Why this priority**: History improves usability and reduces repeated work.

**Independent Test**: Can be tested by saving translations, reloading the app,
and verifying the history list persists and supports copy actions.

**Acceptance Scenarios**:

1. **Given** multiple translations exist, **When** the user opens the history
   view, **Then** past entries appear in reverse chronological order.
2. **Given** a history entry, **When** the user selects it, **Then** the app
   shows its source/translated text and supports copy actions.

---

## Test Strategy (TDD) *(mandatory)*

- **Unit Tests**: First failing tests per story for shortcut capture → request
  creation, settings application, and history persistence in
  `packages/**/src/*.test.ts`.
- **Integration/E2E**: Only if critical; used to validate end-to-end shortcut
  capture and agent invocation when unit tests cannot simulate the host app.
- **Execution**: `npm run test`

### Edge Cases

- No text is selected when the shortcut is pressed.
- The selected text is very long (e.g., multi-paragraph).
- The agent command is missing or fails to execute.
- The agent command is configured but invalid or not found.
- The agent returns empty or malformed output.
- The translation times out or takes too long.

## Constitution Check

- [x] TDD workflow is specified (Red → Green → Refactor, tests first).
- [x] Unit-first testing with Vitest + jsdom; tests live in `packages/**/src/*.test.ts`.
- [x] Package boundaries respected (main/preload/renderer/core/shared) with IPC via shared contracts.
- [x] Agent integration defined: targets, CLI invocation, deterministic selection rules.
- [x] Secrets policy acknowledged; no secrets in Flow/StateDB; local overrides in `.lumberjack/local/`.
- [x] Operational constraints noted (WSLg target, local CLI auth).
- [x] Flow schema rules are N/A for this feature.


## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST capture the currently selected text from the active
  application when a global shortcut is pressed.
- **FR-002**: System MUST send the captured text to a locally available AI agent
  using a configured command and display the returned translation.
- **FR-003**: Users MUST be able to configure a system prompt and a custom
  prompt that influence translation results.
- **FR-004**: Users MUST be able to select a target translation language.
- **FR-005**: Users MUST be able to enable or disable back-translation.
- **FR-006**: System MUST display source text and translated text with separate
  copy actions.
- **FR-007**: System MUST persist translation history locally across sessions.
- **FR-008**: System MUST display translation history and allow re-opening prior
  entries.
- **FR-009**: System MUST clearly report errors when the agent is unavailable or
  execution fails via a top-of-screen error banner that includes a short title,
  the cause, and a retry action.
- **FR-010**: System MUST return and display a translation result quickly enough
  to support rapid usage (see Success Criteria).
- **FR-011**: Users MUST be able to configure the agent command used for
  translation.
- **FR-012**: System MUST deterministically select the configured agent command
  when multiple configs exist by allowing only one isDefault config; if multiple
  are isDefault, the most recently updated config wins.

### Key Entities *(include if feature involves data)*

- **TranslationRecord**: A single translation with source text, translated text,
  target language, prompts used, timestamps, and optional back-translation.
- **PromptSettings**: The system prompt and custom prompt applied to requests.
- **AgentConfig**: The configured agent command and selection rules used for
  translation, including an isDefault flag and updated-at timestamp.

## Agent Integration *(mandatory)*

- **Target Agent(s)**: Codex, Claude Code, GeminiCLI (local agent CLI tools).
- **Invocation Contract**: JSON input over stdin and JSON output over stdout;
  input includes source text, target language, prompts, back-translation flag,
  and agent command; output returns translation, optional back-translation,
  status, and error details.
- **Selection/Fallback**: The agent is chosen via the configured command. Only one isDefault config may be set; if multiple are isDefault, the most recently updated config wins. If the command is unavailable, translations fail fast with a clear error and no fallback unless explicitly configured.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 95% of translations for short selections (<= 200 characters) are
  displayed within 3 seconds of the shortcut.
- **SC-002**: 99% of translation requests either complete successfully or show
  a clear error within 5 seconds.
- **SC-003**: Users can complete a translate-and-copy flow in under 20 seconds
  measured from shortcut press to copy action after the translation result is
  displayed.
- **SC-004**: Translation history persists across app restarts with zero data
  loss for the most recent 100 entries.

## Assumptions & Dependencies

- The app runs in a WSLg environment with a GUI and supports global shortcuts.
- The user has at least one local AI agent CLI installed and authenticated.
- The active application allows reading the currently selected text.

## Out of Scope

- OCR or image-based text extraction.
- Cloud-based translation services or remote storage sync.
- Multi-user accounts or permission management.
