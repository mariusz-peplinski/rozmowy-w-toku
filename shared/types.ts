export type AgentType = 'codex' | 'claude' | 'gemini'

export type ChatId = string
export type ParticipantId = string
export type MessageId = string

export type IsoDateTime = string

export interface RoamingConfig {
  enabled: boolean
  workspaceDir?: string
  mode: 'safe' | 'yolo'
}

export interface Participant {
  id: ParticipantId
  type: AgentType
  displayName: string
  /**
   * Unique, mention-friendly identifier.
   * Prefer agents using @handle (but @DisplayName is also supported).
   */
  handle: string
  colorHex: string
  persona: string
  roaming: RoamingConfig
}

export interface Chat {
  id: ChatId
  title: string
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
  context: string
  participants: Participant[]
}

export interface ChatIndexEntry {
  id: ChatId
  title: string
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

export type MessageAuthorKind = 'user' | 'agent'
export type MessageTrigger = 'manual' | 'mention'

export interface MessageMeta {
  trigger: MessageTrigger
  triggeredByMessageId?: MessageId
  tagSessionIndex?: number
  provider?: AgentType
}

export interface Message {
  id: MessageId
  ts: IsoDateTime
  authorKind: MessageAuthorKind
  authorId: 'user' | ParticipantId
  authorDisplayName: string
  text: string
  meta: MessageMeta
}

export interface CreateChatParticipantInput {
  type: AgentType
  displayName: string
  colorHex: string
  persona: string
  roaming: RoamingConfig
}

export interface CreateChatInput {
  title?: string
  context: string
  participants: CreateChatParticipantInput[]
}

export interface UpdateChatInput {
  chatId: ChatId
  title: string
  context: string
  participants: Participant[]
}

export interface ListMessagesInput {
  chatId: ChatId
  limit?: number
}

export interface AgentRunOptions {
  trigger?: MessageTrigger
  triggeredByMessageId?: MessageId
  tagSessionIndex?: number
}

export type DebugRunStatus = 'running' | 'finished' | 'error' | 'timeout'

export interface DebugRunLog {
  id: string
  chatId: ChatId
  participantId: ParticipantId
  participantDisplayName: string
  provider: AgentType
  trigger: MessageTrigger
  triggeredByMessageId?: MessageId
  tagSessionIndex?: number

  status: DebugRunStatus
  tsStart: IsoDateTime
  tsEnd?: IsoDateTime

  command: string
  args: string[]
  cwd: string
  timeoutMs: number
  roaming: RoamingConfig

  promptLength: number
  promptPreview: string

  stdout?: string
  stderr?: string
  exitCode?: number | null
  timedOut?: boolean
  signal?: string | null
  error?: string
}

export interface RunBatchResult {
  /**
   * Messages appended as a result of this action:
   * - 1 user/agent message
   * - plus 0+ auto mention-triggered replies
   */
  messages: Message[]
  /**
   * True when there were still pending @mentions after hitting the session cap.
   * The UI should offer "Resume auto replies".
   */
  mentionPaused: boolean
  pendingMentionParticipantIds?: ParticipantId[]
}

export type AgentRunStatus = 'running' | 'finished' | 'error' | 'timeout'

export interface AgentRunStatusEvent {
  runId: string
  chatId: ChatId
  participantId: ParticipantId
  participantDisplayName: string
  status: AgentRunStatus
  ts: IsoDateTime
  provider: AgentType
}
