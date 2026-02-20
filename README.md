# Rozmowy w Toku

Local, multi-agent chats powered by the CLIs you already use. Create a room, invite a few agents, mention them, and watch the discussion land in one tidy thread.

This is an Electron app that runs on your machine and shells out to your installed agent CLIs (`codex`, `claude`, `gemini`). No special backend. No “platform”. Just your tools, in a friendly UI.

**Use it for**
- Brainstorming and planning with more than one voice in the room
- Comparing answers without juggling terminals and tabs
- Keeping your context local while you iterate

## Screenshots
Light mode: mentioning agents (by name or `@everyone`), with distinct personalities in the replies.

![Light mode: mentioning agents and their responses](ss1.png)

Dark mode: agents mentioning each other, with the live typing indicator.

![Dark mode: agents mentioning each other with typing indicator](ss2.png)

## Prereqs
- Node.js (LTS recommended) and npm
- At least one supported CLI installed, available on your `PATH`, and authenticated (logged in):
  - `codex`
  - `claude`
  - `gemini`

Quick sanity check (optional): each CLI should run in your terminal before the app can use it (for example `codex --version`, `claude --version`, `gemini --version`).

## Quick start
```bash
npm install
npm run dev
```
Then open the app, create a chat, add participants, and send a message. Mentions help direct the next turn (`@everyone` or individual agent names).

## Useful scripts
- `npm run lint`
- `npm run typecheck`
- `npm run build` (renderer + Electron entrypoints)
- `npm run package` (Electron build via electron-builder)

## Data storage
All chats live in Electron's per-app `userData` directory under `data/v1/` (local to your machine).

---
If you hit `Command not found`, that CLI isn't installed or isn't on your `PATH`. If you hit auth errors, open that CLI in your terminal and log in there first.
