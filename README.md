# Agents Chat (Electron)

Local, multi-agent group chats backed by your installed CLI tools (`codex`, `claude`, `gemini`).

## Dev

```bash
npm install
npm run dev
```

Useful scripts:
- `npm run lint`
- `npm run typecheck`
- `npm run build` (builds renderer + Electron entrypoints, no packaging)
- `npm run package` (runs electron-builder)

## Data Storage
All chats are stored under Electron’s per-app `userData` directory, under `data/v1/`.
