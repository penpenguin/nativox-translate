# Flow Schema Migration Rules

## Principles

- Migrations are **forward-only**. Older schemas are upgraded in memory to the current version.
- The Flow JSON is rewritten only on explicit save. Loading never mutates disk.
- Unknown fields (including `x-*` extensions) must be preserved when loading/saving.
- If a Flow has a schemaVersion newer than supported, it is loaded as read-only.

## Current Version

- `schemaVersion: 1`
- Node data supports `inputArtifacts` and `outputArtifacts` with `name/ref/path` fields.
- `contextOverrides` supports `{ key, value }` where `value: null` removes the key.

## Migration Strategy

- Minor additions (new optional fields) should not require a version bump.
- Breaking changes (renamed or required fields) must:
  1. Introduce a new schemaVersion.
  2. Provide an in-memory migration that maps older fields to the new shape.
  3. Preserve unknown fields to avoid data loss.

## Example Mapping (legacy → v1)

- Legacy `inputArtifacts[].id` → `inputArtifacts[].name`
- Legacy `outputArtifacts[].id` → `outputArtifacts[].name`
- Legacy `contextOverrides[].source` → `contextOverrides[].key`

These mappings should be handled in `FlowStore.migrateSchema` when needed.
