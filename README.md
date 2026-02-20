# Rozmowy w Toku

A cozy, local chat room for your CLI copilots. Spin up a group conversation, point it at your prompt, and let your installed agents do the talking.

**What it is**
A small Electron app for running multi-agent chats locally, backed by the CLI tools you already have (`codex`, `claude`, `gemini`). No cloud service required; it just shells out to your CLIs and brings the replies back into one place.

**What it's for**
- Brainstorming with multiple agents at once
- Comparing answers side-by-side without switching terminals
- Keeping project context local while you iterate

## Prereqs
- Node.js (LTS recommended) and npm
- At least one supported CLI installed and on your `PATH`: `codex`, `claude`, `gemini`

## Quick start
```bash
npm install
npm run dev
```
Then open the app, create a new chat, add participants, and send your prompt.

## Useful scripts
- `npm run lint`
- `npm run typecheck`
- `npm run build` (renderer + Electron entrypoints)
- `npm run package` (Electron build via electron-builder)

## Data storage
All chats live in Electron's per-app `userData` directory under `data/v1/`.

---
If you hit a `Command not found` error, it usually means the matching CLI isn't installed or isn't on your `PATH`.
