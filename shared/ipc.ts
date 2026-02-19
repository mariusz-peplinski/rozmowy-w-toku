import type {
  Chat,
  ChatId,
  ChatIndexEntry,
  CreateChatInput,
  ListMessagesInput,
  Message,
} from './types'

export const IpcChannels = {
  ChatsList: 'chats:list',
  ChatsCreate: 'chats:create',
  ChatsGet: 'chats:get',
  ChatsUpdate: 'chats:update',
  MessagesList: 'messages:list',
  MessagesAppendUser: 'messages:appendUser',
  MessagesAppended: 'messages:appended',
  MessagesDelete: 'messages:delete',
  AgentsRun: 'agents:run',
  AgentRunStatus: 'agents:runStatus',
  MentionsResume: 'mentions:resume',
  MentionState: 'mentions:state',
  DialogPickDirectory: 'dialog:pickDirectory',
  DebugRunsList: 'debug:runs:list',
  DebugRunsClear: 'debug:runs:clear',
} as const

export type IpcChannel = typeof IpcChannels[keyof typeof IpcChannels]

export interface RendererApi {
  chats: {
    list(): Promise<ChatIndexEntry[]>
    create(input: CreateChatInput): Promise<Chat>
    get(chatId: ChatId): Promise<Chat>
    update(input: import('./types').UpdateChatInput): Promise<Chat>
  }
  messages: {
    list(input: ListMessagesInput): Promise<Message[]>
    appendUser(chatId: ChatId, text: string): Promise<import('./types').RunBatchResult>
    delete(chatId: ChatId, messageId: string): Promise<void>
  }
  agents: {
    run(chatId: ChatId, participantId: string, opts?: { trigger?: 'manual' | 'mention'; triggeredByMessageId?: string; tagSessionIndex?: number }): Promise<import('./types').RunBatchResult>
  }
  mentions: {
    resume(chatId: ChatId): Promise<import('./types').RunBatchResult>
  }
  dialog: {
    pickDirectory(): Promise<string | null>
  }
  debug: {
    listRuns(chatId: ChatId): Promise<import('./types').DebugRunLog[]>
    clearRuns(chatId: ChatId): Promise<void>
  }
  events: {
    onAgentRunStatus(cb: (evt: import('./types').AgentRunStatusEvent) => void): () => void
    onMessageAppended(cb: (evt: import('./types').MessageAppendedEvent) => void): () => void
    onMentionState(cb: (evt: import('./types').MentionStateEvent) => void): () => void
  }
}
