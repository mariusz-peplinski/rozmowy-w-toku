# Electron “AI Group Chat” App Plan

## Goal
Build a cross-platform (macOS/Windows/Linux) Electron app (Node.js + React + TypeScript) that provides a “group chat” UI where each participant is an AI agent (Codex / Claude / Gemini) or the human user. Chats are stored locally under Electron’s per-app `userData` directory. The user can:

- Create new chats and view old chats.
- Configure per-chat participants (copied into the chat at creation time) with:
  - `type`: `codex | claude | gemini` (mapped to local CLI commands `codex`, `claude`, `gemini`)
  - `displayName`, `role/persona`, `color`
  - optional `roaming` mode: run the CLI in a chosen workspace directory with elevated autonomy so it can read files / run commands.
- Provide per-chat “context” (general prompt for the discussion).
- In a chat, either send a message as the user or click an agent to respond next.
- Support @mentions: agents can write `@DisplayName` to trigger immediate responses from tagged agents, with a cap of 3 “tagging sessions” (rounds) without user intervention.

System prompts are supported as an optional future extension, but v1 focuses on: persona + chat context + chat instructions + conversation transcript.

## Non-goals (v1)
- Streaming token-by-token UI.
- Editing/deleting messages (append-only).
- Cloud sync, accounts, multi-device.
- Complex agent tool UI (diff viewers, approvals UI inside the app). We defer to each provider’s CLI for tool execution.

## Key Constraints / Assumptions
- The user has `codex`, `claude`, and `gemini` CLIs installed and authenticated.
- The app shells out to those commands as subprocesses and captures stdout as the “message”.
- “Roaming mode” is dangerous by design; we will gate it behind explicit warnings and store it per-agent-per-chat.

## High-Level Architecture

### Electron process split
- **Main process** (Node):
  - Owns persistence (filesystem under `app.getPath("userData")`).
  - Owns agent execution (spawning CLIs, timeouts, cancellation).
  - Owns tagging engine (detect mentions, run fan-out sessions in parallel).
  - Exposes IPC APIs to renderer.
- **Renderer** (React):
  - Chat list UI and chat view UI.
  - New chat wizard (context + participants).
  - Message composer and “Run agent” actions.
  - Displays message bubbles with participant colors.
- **Preload**:
  - Typed, minimal IPC surface (`window.api.*`).
  - `contextIsolation: true`, `nodeIntegration: false`.

### Project scaffolding (recommended)
Use a Vite-based Electron template to keep dev simple:
- `electron-vite` (Electron + Vite + React + TS) or equivalent.
- `npm run dev` runs Electron + hot reload.

## Data Storage
All data lives under Electron `userData`, e.g.:
- macOS: `~/Library/Application Support/<AppName>/`
- Windows: `%APPDATA%\<AppName>\`
- Linux: `~/.config/<AppName>/`

We will create a versioned data directory:
- `<userData>/data/v1/`

### File layout
- `<userData>/data/v1/chats/index.json`
  - List of chats for fast sidebar rendering (id/title/updatedAt).
- `<userData>/data/v1/chats/<chatId>/chat.json`
  - Chat metadata (context + participants snapshot).
- `<userData>/data/v1/chats/<chatId>/messages.jsonl`
  - Append-only JSON Lines of message events.
- `<userData>/data/v1/settings.json`
  - App-level settings, including default agent presets/personas (user-overridable).

### IDs
- `chatId`: `c_<ulid>`
- `participantId`: `a_<ulid>`
- `messageId`: `m_<ulid>`

### Schemas (v1)
`Participant` (copied into each chat):
- `id`, `type`, `displayName`, `handle`, `colorHex`
- `persona`: string (role/instructions)
- `roaming`:
  - `enabled`: boolean
  - `workspaceDir`: absolute path (string) if enabled
  - `mode`: `"safe" | "yolo"` (v1 will primarily implement `"yolo"`; `"safe"` is a future refinement)

`Chat`:
- `id`, `title`, `createdAt`, `updatedAt`
- `context`: string
- `participants: Participant[]`

`Message` (JSONL line):
- `id`, `ts`
- `authorKind`: `"user" | "agent"`
- `authorId`: `"user"` or `participantId`
- `authorDisplayName`: snapshot string (so renames don’t break old messages)
- `text`: markdown string
- `meta`:
  - `trigger`: `"manual" | "mention"`
  - `triggeredByMessageId?: string`
  - `tagSessionIndex?: number`
  - `provider`: `"codex" | "claude" | "gemini"` (for agents)

### Atomicity
- `index.json` and `chat.json` are written atomically: write temp + rename.
- `messages.jsonl` is append-only. Each message append is a single write.

## UI / UX

### Layout
- Left sidebar: chat list + “New chat” button.
- Main panel:
  - Header: chat title + context summary.
  - Scrollable message timeline with colored bubbles.
  - Composer:
    - textarea for user message
    - send as user
    - agent buttons (one per participant) to “speak next”

### New chat flow
1. Chat title (optional; default “New chat <date>”)
2. Chat context (textarea)
3. Participants:
   - Add participant:
     - Type: Codex / Claude / Gemini
     - Display name
     - Persona (textarea)
     - Color picker
     - Roaming toggle:
       - Choose workspace directory via OS folder picker
       - Show warning + require checkbox “I understand this can run arbitrary commands”
4. Create chat -> writes chat metadata and creates empty messages file.

### Mention behavior
- Messages render `@DisplayName` as clickable chips (optional).
- If a message contains mentions of one or more participants:
  - Those participants are automatically scheduled to respond (in parallel) immediately.
  - The fan-out runs in up to **3 sessions** (rounds) maximum per user action:
    - Session 1: triggered by the original message.
    - Session 2: triggered by mentions inside session 1 agent replies.
    - Session 3: triggered by mentions inside session 2 replies.

## Core Logic: Tagging Sessions

### Mention parsing
We need reliable matching even when display names contain spaces.
Implementation approach:
- Each participant has:
  - `displayName` (shown)
  - `handle` (generated at creation; lowercase slug, e.g. “Jane Doe” -> `jane-doe`)
- The instruction to agents will prefer `@handle` for robustness, but we will also accept `@DisplayName`.
  - UI shows as display name; mention detection supports both.
- Parser algorithm:
  - Build candidate mention tokens for all participants: `@handle` and `@displayName`.
  - Sort candidates by length descending and match greedily in message text (case-insensitive for handles, case-sensitive or case-insensitive for displayName configurable).
  - Avoid matching inside emails/URLs by requiring a word boundary before `@` or start-of-string.

### Fan-out execution model
Given a “trigger message” and current chat history:
1. Compute mentioned participants not equal to author.
2. If none, stop.
3. Session loop from `1..3`:
   - Snapshot the transcript at the start of the session (messages up to now).
   - For every participant triggered in this session:
     - spawn their CLI in parallel using that same snapshot transcript
   - When all finish:
     - append their replies as new messages
     - compute mentions found in those new messages
     - set the next session’s triggered participants to the union of mentions (deduped)
4. Stop when no new triggers or session cap reached.

Notes:
- This design avoids ordering bias and ensures each “round” responds to the same state.
- We do not auto-break A->B->A loops; the session cap bounds it.

## Prompt Construction

### Inputs
- Participant persona (role)
- Chat context (general prompt)
- Short participant roster (name + one-line persona summary)
- Transcript so far
- Instruction: “Respond as {displayName} with a single message appropriate for the chat.”

### Prompt template (markdown)
We will assemble a single markdown prompt:

- `# Role`
- `# Chat Context`
- `# Participants`
- `# Instructions`
  - respond in character
  - be concise unless necessary
  - you may mention others via `@handle` or `@DisplayName`
  - output only the message body (no prefixes like “{name}:”)
- `# Transcript`
  - each line: `**Name**: message`

We will also include a safety note when roaming is enabled:
- “You have access to a local workspace directory and may use tools to read files or run commands if needed to answer accurately.”

## Provider Integration (CLI Runner)

We implement a `ProviderRunner` interface in the main process:
- `run({ provider, prompt, roaming, workspaceDir, timeoutMs, env }) -> { stdout, stderr, exitCode }`
- Always:
  - run with `cwd` set to either chat workspace (roaming) or app working dir
  - set `stdio` to capture output
  - enforce timeout (kill process tree)

### Codex (`codex`)
Use non-interactive mode: `codex exec "<prompt>"`.
- Normal mode:
  - `codex exec --color never --ephemeral "<prompt>"`
- Roaming mode (dangerous; supports file reads + command exec):
  - `codex exec --color never --ephemeral --cd "<workspaceDir>" --yolo --sandbox danger-full-access --full-auto "<prompt>"`
  - If workspace is not a git repo, optionally add: `--skip-git-repo-check` (v1: detect with `git rev-parse --is-inside-work-tree`).

We will initially parse the final message from stdout (Codex streams progress to stderr by default in exec mode).

### Claude (`claude`)
Use headless print mode: `claude -p "<prompt>"`.
- Normal mode:
  - `claude -p "<prompt>" --output-format text`
- Roaming mode:
  - `claude -p "<prompt>" --output-format text --cwd "<workspaceDir>" --permission-mode acceptEdits --allowedTools "Bash,Read,Write"`

Notes:
- `--allowedTools` and `--permission-mode` are the primary knobs for enabling tool usage.
- If Claude prints additional metadata, we can switch to `--output-format json` later and parse `final` fields.

### Gemini (`gemini`)
Use headless mode with `--prompt` / `-p` or stdin.
- Normal mode:
  - `gemini -p "<prompt>"`
- Roaming mode (best-effort):
  - run `gemini` with `cwd = workspaceDir`
  - provide an injected settings file to bypass tool confirmations for common safe commands:
    - Create a temporary JSON settings file under `<userData>/data/v1/tmp/gemini-settings-<chatId>-<agentId>.json`
    - Set env for the child process:
      - `GEMINI_CLI_SYSTEM_SETTINGS_PATH=<that file>`
    - Settings include:
      - `output.format="text"`
      - `tools.core` allowlist that includes `run_shell_command` (wildcard) and core FS tools (read/list/grep/glob/edit/write).
      - optional: disable folder trust prompts (if applicable) by ensuring `security.folderTrust.enabled=false`

This allows Gemini to run tools without prompting (within its own restrictions). If Gemini still prompts interactively in some setups, we will fall back to non-roaming behavior and show an error with stderr.

## IPC API (Main <-> Renderer)
Use `ipcMain.handle` and `ipcRenderer.invoke` with a typed contract.

Core endpoints:
- `settings.get`, `settings.update`
- `chats.list`
- `chats.create`
- `chats.get(chatId)`
- `messages.list(chatId, { limit, cursor })` (cursor optional for large histories)
- `messages.appendUser(chatId, text)`
- `agents.run(chatId, participantId, { trigger: manual | mention, triggeredByMessageId?, tagSessionIndex? })`
- `dialog.pickDirectory()` (for roaming workspace selection)

Also:
- `agents.cancel(runId)` (optional v1)
- `agents.runStatus` via events (`ipcRenderer.on`) for “typing” indicators (started/finished/error).

## Implementation Steps (Concrete)

### 1) Scaffold the app
- Initialize Electron + Vite + React + TS template.
- Add strict TS config.
- Set Electron security defaults (context isolation, CSP where feasible).

Deliverable:
- `npm run dev` launches an empty Electron window with React.

### 2) Persistence layer (main process)
- Implement `UserDataPaths` helper.
- Implement `ChatStore`:
  - create/list/load chat metadata
  - append message to JSONL
  - read messages (tail with limit)
  - keep `index.json` updated (updatedAt, title)

Deliverable:
- Renderer can create chats, list chats, and append/read messages.

### 3) UI v1
- Sidebar chat list + new chat wizard.
- Chat view + messages timeline + composer.
- Participant “speak” buttons (click to run that agent next).

Deliverable:
- Human user can chat in a persisted chat (no agents yet).

### 4) Provider runners (subprocess integration)
- Implement `ProviderRunner` and per-provider command builders.
- Implement timeouts, cancellation (SIGTERM then SIGKILL).
- Normalize outputs:
  - trim trailing whitespace
  - strip ANSI if present (prefer passing flags to disable)

Deliverable:
- “Run agent” button produces a message in timeline for each provider (normal mode).

### 5) Prompt assembler
- Implement transcript formatting and instruction block.
- Include participant roster and chat context.
- Store minimal run metadata in message `meta`.

Deliverable:
- Agent replies are coherent and “in character”.

### 6) Mention detection + 3-session fan-out
- Implement mention parser (handle + displayName).
- After appending any message, run the fan-out engine:
  - session 1 triggered by the appended message
  - session 2/3 triggered by mentions in prior session replies
- Run all triggered agents in a session in parallel against the same snapshot.
- Append replies only after all completed.

Deliverable:
- @mentions trigger immediate multi-agent replies, bounded to 3 rounds.

### 7) Roaming mode (danger gating)
- Add UI toggle + directory picker per participant in the new chat wizard.
- Implement roaming-specific runner args/env for each provider.
- Add a prominent warning and require explicit confirmation before enabling.

Deliverable:
- In roaming mode, agents can access the selected directory via their CLI tool capabilities (provider-dependent).

### 8) Hardening + usability polish
- Better error surfaces (missing command, auth missing, nonzero exit code).
- “Command not found” detection with actionable hints.
- Per-agent “running” indicators.
- Large history handling (pagination / tail).

## Validation / Smoke Tests
Manual smoke checks (cross-platform oriented):
- Create chat, restart app, chat persists.
- Add participants, run each provider in normal mode, message appears.
- Mention `@agent` and observe fan-out and session cap.
- Enable roaming and verify:
  - `cwd` is applied (e.g. agent can reference local files).
  - dangerous flags are only used when roaming is enabled.

## Future Extensions (Post-v1)
- Optional per-agent system prompts (file-backed `.md` or textarea) plus preset library.
- Streaming responses (stdout streaming into UI).
- Agent profiles reusable across chats (separate from chat snapshot).
- Export/import chats.
- Per-chat “project context” file include rules (e.g. include `README.md`, `package.json`).
- Tool transcript viewer (show what commands/files an agent touched).

