import { contextBridge, ipcRenderer } from 'electron'
import type { RendererApi } from '../shared/ipc'
import { IpcChannels } from '../shared/ipc'
import type { AgentRunOptions, AgentRunStatusEvent, CreateChatInput, ListMessagesInput, UpdateChatInput } from '../shared/types'

const api: RendererApi = {
  chats: {
    list: () => ipcRenderer.invoke(IpcChannels.ChatsList),
    create: (input: CreateChatInput) => ipcRenderer.invoke(IpcChannels.ChatsCreate, input),
    get: (chatId: string) => ipcRenderer.invoke(IpcChannels.ChatsGet, chatId),
    update: (input: UpdateChatInput) => ipcRenderer.invoke(IpcChannels.ChatsUpdate, input),
  },
  messages: {
    list: (input: ListMessagesInput) => ipcRenderer.invoke(IpcChannels.MessagesList, input),
    appendUser: (chatId: string, text: string) => ipcRenderer.invoke(IpcChannels.MessagesAppendUser, chatId, text),
    delete: (chatId: string, messageId: string) => ipcRenderer.invoke(IpcChannels.MessagesDelete, chatId, messageId),
  },
  agents: {
    run: (chatId: string, participantId: string, opts?: AgentRunOptions) =>
      ipcRenderer.invoke(IpcChannels.AgentsRun, chatId, participantId, opts ?? {}),
  },
  mentions: {
    resume: (chatId: string) => ipcRenderer.invoke(IpcChannels.MentionsResume, chatId),
  },
  dialog: {
    pickDirectory: () => ipcRenderer.invoke(IpcChannels.DialogPickDirectory),
  },
  debug: {
    listRuns: (chatId: string) => ipcRenderer.invoke(IpcChannels.DebugRunsList, chatId),
    clearRuns: (chatId: string) => ipcRenderer.invoke(IpcChannels.DebugRunsClear, chatId),
  },
  events: {
    onAgentRunStatus: (cb) => {
      const listener = (_evt: unknown, payload: AgentRunStatusEvent) => cb(payload)
      ipcRenderer.on(IpcChannels.AgentRunStatus, listener)
      return () => ipcRenderer.off(IpcChannels.AgentRunStatus, listener)
    },
  },
}

contextBridge.exposeInMainWorld('api', api)
