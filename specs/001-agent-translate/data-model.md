# Data Model: Agent Translation App

## Entities

### TranslationRecord

**Purpose**: Represents a single translation result stored in history.

**Fields**:
- `id` (string): Unique identifier
- `createdAt` (datetime)
- `sourceText` (string, required, non-empty)
- `translatedText` (string, required for success)
- `backTranslatedText` (string, optional)
- `targetLanguage` (string, required)
- `systemPrompt` (string, optional)
- `customPrompt` (string, optional)
- `agentCommand` (string, required)
- `durationMs` (number, optional)
- `status` (enum: `success`, `error`)
- `errorMessage` (string, optional)

**Validation rules**:
- `sourceText` length > 0
- `targetLanguage` must be set
- `translatedText` required when `status = success`
- `errorMessage` required when `status = error`

**State transitions**:
- `pending` (in-memory only) → `success` or `error` on completion

### PromptSettings

**Purpose**: Stores prompt configuration used for translations.

**Fields**:
- `systemPrompt` (string, optional)
- `customPrompt` (string, optional)
- `updatedAt` (datetime)

**Validation rules**:
- Prompts may be empty but must be valid UTF-8 text

### AgentConfig

**Purpose**: Defines which local agent command is used for translation.

**Fields**:
- `agentId` (string)
- `displayName` (string)
- `command` (string, required)
- `args` (string[], optional)
- `isDefault` (boolean, active flag)
- `updatedAt` (datetime)

**Validation rules**:
- `command` must be non-empty
- Exactly one `AgentConfig` should be `isDefault = true`; if multiple are true,
  select the most recently updated config

## Relationships

- `TranslationRecord` stores a snapshot of the prompts and agent command used at
  the time of translation.
- `PromptSettings` and `AgentConfig` represent the current defaults used when
  creating new `TranslationRecord` entries.
