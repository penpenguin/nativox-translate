<!--
Sync Impact Report
- Version change: 1.0.0 → 1.1.0
- Modified principles: None (no renames)
- Added sections: Core Principles - VI. Agent-Driven Translation via Local CLI
- Removed sections: None
- Templates requiring updates:
  - .specify/templates/plan-template.md ✅ updated
  - .specify/templates/spec-template.md ✅ updated
  - .specify/templates/tasks-template.md ✅ updated
  - .specify/templates/commands/*.md ⚠ not found in repo
- Follow-up TODOs:
  - TODO(RATIFICATION_DATE): original adoption date not recorded; set the YYYY-MM-DD ratification date.
-->
# Nativox Translate Constitution

## Core Principles

### I. Test-Driven Development (t-wada) Is Mandatory
All production changes MUST follow the Red → Green → Refactor cycle in the
smallest possible steps. Start from the simplest failing test, use triangulation
when generalizing behavior, and refactor only after green. Bug fixes MUST begin
with a failing test that reproduces the issue. Commits SHOULD be small and
reflect TDD phases; when not feasible, document the reason in the plan or PR.
Rationale: Ensures correctness, guides design, and prevents regressions.

### II. Unit-First, Fast Feedback Testing
Unit tests with Vitest + jsdom MUST be the primary test type. Tests MUST live
alongside code as
`packages/**/src/*.test.ts`. E2E tests are allowed only for critical flows and
MUST be justified in the plan. Tests MUST be deterministic and runnable via
`npm run test`.
Rationale: Keeps feedback loops fast enough to sustain TDD.

### III. Package Boundary Integrity
Functionality MUST live in the correct package: Electron main process in
`packages/main`, preload APIs in `packages/preload`, UI in
`packages/renderer`, domain logic in `packages/core`, and shared types/IPC
contracts in `packages/shared`. Cross-boundary interactions MUST go through
shared IPC contracts; avoid circular dependencies and direct renderer ↔ main
imports.
Rationale: Preserves separation of concerns and IPC safety.

### IV. Forward-Only Flow Schema Evolution
Flow schema changes MUST be forward-only. Loading MUST never mutate disk, and
unknown fields (including `x-*` extensions) MUST be preserved. If a Flow has a
newer `schemaVersion` than supported, it MUST load read-only. Breaking schema
changes MUST introduce a new `schemaVersion` and provide in-memory migrations.
Rationale: Prevents data loss and ensures compatibility across versions.

### V. Secrets & Local Override Hygiene
Secrets MUST NOT be stored in Flow JSON or the StateDB; use existing CLI auth
and environment-level credentials instead. Local overrides belong in
`.lumberjack/local/` only and MUST remain git-ignored. Large artifacts MUST be
stored by reference and kept on disk for downstream nodes.
Rationale: Protects security and keeps repositories reproducible.

### VI. Agent-Driven Translation via Local CLI
Translation MUST be performed by invoking an AI agent available in the running
environment (e.g., Codex, Claude Code, GeminiCLI). The agent interface MUST be
text-in/text-out (stdin/stdout or equivalent), and the selected agent MUST be
explicit in configuration or UI. When multiple agents are supported, selection
behavior MUST be deterministic and documented.
Rationale: Ensures compatibility with local agent ecosystems and portability.

## Operational Constraints

- Target environment is WSLg (Linux) with an Electron UI runtime. Behavior
  outside WSLg/Electron is not validated.
- External CLI tools (git, gh, glab, AI agent binaries) MUST be installed and
  authenticated separately.
- StateDB lives under the git common directory and uses file locks; multiple
  concurrent instances are blocked.
- Command approvals are enforced per project; allowlist restrictions may
  prevent execution.

## Development Workflow & Quality Gates

- All code changes MUST include tests written first (TDD) and pass `npm run test`.
- `npm run lint` and `npm run format` MUST be clean before merge.
- Plans and specs MUST include a Constitution Check and list any justified
  violations in the plan's Complexity Tracking table.
- Plans and specs MUST identify target agent(s), invocation mechanism, and
  selection/fallback behavior.
- Flow schema changes MUST update migration logic and
  `docs/flow-schema-migrations.md`.
- Documentation updates are required when constraints or workflows change.

## Governance

This constitution supersedes other project practices. Amendments MUST be made
via a documented change (PR or equivalent) that includes rationale, scope, and
any required migration/rollout plan. When principles or governance rules change,
update dependent templates and guidance documents in the same change set.

**Versioning policy**: Use semantic versioning for this constitution. MAJOR for
backward-incompatible governance or principle removals/redefinitions, MINOR for
new principles/sections or materially expanded guidance, PATCH for clarifications
or non-semantic refinements.

**Compliance review**: Every plan, spec, and implementation review MUST verify
compliance with the Core Principles and Governance rules. Deviations require
explicit written justification and mitigation.

**Version**: 1.1.0 | **Ratified**: TODO(RATIFICATION_DATE): original adoption date not recorded | **Last Amended**: 2026-01-06
