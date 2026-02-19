import path from 'node:path'

export interface DataPaths {
  dataRoot: string
  v1Root: string
  chatsRoot: string
  chatsIndexFile: string
  settingsFile: string
}

export function getDataPaths(userDataPath: string): DataPaths {
  const dataRoot = path.join(userDataPath, 'data')
  const v1Root = path.join(dataRoot, 'v1')
  const chatsRoot = path.join(v1Root, 'chats')
  return {
    dataRoot,
    v1Root,
    chatsRoot,
    chatsIndexFile: path.join(chatsRoot, 'index.json'),
    settingsFile: path.join(v1Root, 'settings.json'),
  }
}

export function chatDir(chatsRoot: string, chatId: string): string {
  return path.join(chatsRoot, chatId)
}

export function chatMetaFile(chatsRoot: string, chatId: string): string {
  return path.join(chatDir(chatsRoot, chatId), 'chat.json')
}

export function chatMessagesFile(chatsRoot: string, chatId: string): string {
  return path.join(chatDir(chatsRoot, chatId), 'messages.jsonl')
}

export function chatWorkspaceDir(chatsRoot: string, chatId: string): string {
  // A safe, per-chat working directory under userData.
  // Used for providers that prefer (or require) running inside a workspace.
  return path.join(chatDir(chatsRoot, chatId), 'workspace')
}
