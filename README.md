# Rozmowy w Toku

Group chats for your local agent CLIs.

Rozmowy w Toku is a small Electron app. When you send a message, it runs one or more CLI agents (`codex`, `claude`, `gemini`) and shows their replies in a single thread. Agents are aware of each other, see each others messages, and can @mention other agents to incite a response.

Each agent is defined by specifying a base model (codex/claude/gemini), a persona prompt, and optionally granting it access to read files and run commands in specified directory.

Works well for:
- code reviews (even without personas assigned, just different base models),
- consensus-based answers (with one agent as designated moderator/decision maker),
- brainstorming ideas (using personas of e.g. customer focused vs income focused vs crazy creative),
- architectural discussions (assigning agents to different directories e.g. frontend and backend, legacy version vs new version).

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

Quick sanity check: the CLI you plan to use should run in your terminal (for example `codex --version`).

## Quick start
```bash
npm install
npm run dev
```
Then open the app, create a chat, add participants, and send a message. Use `@everyone` or agent mentions to steer who should answer next.

## Useful scripts
- `npm run lint`
- `npm run typecheck`
- `npm run build` (renderer + Electron entrypoints)
- `npm run package` (Electron build via electron-builder)

## Data storage
All chats live in Electron's per-app `userData` directory under `data/v1/`.

---
If you see `Command not found`, that CLI isn't installed or isn't on your `PATH`. If you see auth errors, run that CLI in your terminal and log in there first.
