# Research: Agent Translation App

## Decision 1: Selected Text Capture Strategy

**Decision**: Use a global shortcut to trigger a temporary clipboard capture
(copy) of the active selection, then restore the previous clipboard contents.

**Rationale**: Works across most apps in WSLg without requiring per-app
integrations or accessibility APIs. Keeps the flow fast and consistent.

**Alternatives considered**:
- Accessibility API text extraction (less portable in WSLg, higher complexity)
- App-specific integrations (high maintenance, narrow coverage)

## Decision 2: Agent Invocation Contract

**Decision**: Invoke the configured CLI command with structured input over
stdin (JSON with source text, target language, prompts, back-translation flag)
and expect structured JSON on stdout for translation + optional back-translation.

**Rationale**: JSON allows deterministic parsing for both primary and
back-translation outputs, avoids ambiguous text parsing, and supports multiple
agent CLIs through prompt/adapter normalization.

**Alternatives considered**:
- Plain text input/output only (ambiguous back-translation handling)
- CLI flags for each prompt field (inconsistent across agents)

## Decision 3: History Persistence

**Decision**: Store translation history in local SQLite (node-sqlite3-wasm) and
retain the most recent 100 entries with timestamps and prompts used.

**Rationale**: SQLite provides durable local storage with fast lookup and
ordering. Retention aligns with success criteria and keeps performance stable.

**Alternatives considered**:
- Flat JSON file storage (simpler but slower and harder to query)
- In-memory history only (lost on restart)

## Decision 4: IPC and Package Boundaries

**Decision**: Run shortcut capture, clipboard access, and agent exec in the main
process; expose APIs via preload; keep domain logic in core and UI in renderer.

**Rationale**: Matches security boundaries, avoids direct renderer access to
OS/exec, and aligns with existing package structure.

**Alternatives considered**:
- Execute agent calls in renderer (security risk, violates boundaries)
- Direct renderer ↔ main imports (breaks IPC contract separation)

## Decision 5: Performance Handling

**Decision**: Enforce a 5s timeout for agent calls and surface partial failures
as user-visible errors while keeping the UI responsive.

**Rationale**: Aligns with success criteria for response time and provides
predictable behavior under slow or failing agents.

**Alternatives considered**:
- No timeout (risk of indefinite hangs)
- Aggressive 1–2s timeout (risks false failures for slower agents)

## Decision 6: Agent Configuration Selection Rule

**Decision**: Allow only one active agent configuration; if multiple are active,
select the most recently updated configuration.

**Rationale**: Ensures deterministic selection and aligns with the clarified
requirement while remaining resilient to configuration drift.

**Alternatives considered**:
- User-managed priority list (more UI complexity)
- Last-used auto-selection (less predictable)
