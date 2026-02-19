import type { ChatId, Message, Participant, ParticipantId } from '../../../shared/types'
import type { ChatStore } from '../store/chatStore'
import type { AgentService } from '../agents/agentService'
import { extractMentionedParticipantIds } from './mentionParser'

export class MentionEngine {
  private readonly chatStore: ChatStore
  private readonly agentService: AgentService
  private readonly onMessageAppended?: (chatId: ChatId, message: Message) => void
  private readonly onMentionState?: (chatId: ChatId, paused: boolean, pendingParticipantIds: ParticipantId[]) => void
  private readonly perChatQueue = new Map<string, Promise<unknown>>()
  private readonly pendingByChat = new Map<string, Map<ParticipantId, string>>()

  constructor(opts: {
    chatStore: ChatStore
    agentService: AgentService
    onMessageAppended?: (chatId: ChatId, message: Message) => void
    onMentionState?: (chatId: ChatId, paused: boolean, pendingParticipantIds: ParticipantId[]) => void
  }) {
    this.chatStore = opts.chatStore
    this.agentService = opts.agentService
    this.onMessageAppended = opts.onMessageAppended
    this.onMentionState = opts.onMentionState
  }

  /**
   * Runs up to 3 mention-triggered sessions (rounds).
   * Each session runs triggered agents in parallel against a transcript snapshot,
   * and appends each reply as soon as it completes.
   */
  async runFromTriggerMessage(
    chatId: ChatId,
    triggerMessage: Message,
    maxSessions = 3,
  ): Promise<{ appended: Message[]; paused: boolean; pendingParticipantIds: ParticipantId[] }> {
    // Any new user/agent action supersedes a previous "paused" mention chain.
    this.pendingByChat.delete(chatId)
    this.onMentionState?.(chatId, false, [])
    return this.enqueue(chatId, () => this.runFromTriggerMessageInternal(chatId, triggerMessage, maxSessions))
  }

  async resume(chatId: ChatId, maxSessions = 3): Promise<{ appended: Message[]; paused: boolean; pendingParticipantIds: ParticipantId[] }> {
    return this.enqueue(chatId, () => this.resumeInternal(chatId, maxSessions))
  }

  private async resumeInternal(chatId: ChatId, maxSessions: number): Promise<{ appended: Message[]; paused: boolean; pendingParticipantIds: ParticipantId[] }> {
    const pending = this.pendingByChat.get(chatId)
    if (!pending || pending.size === 0) return { appended: [], paused: false, pendingParticipantIds: [] }

    const chat = await this.chatStore.getChat(chatId)
    const currentTriggers = new Map<ParticipantId, string>(pending)
    this.pendingByChat.delete(chatId)

    return this.runSessions(chatId, chat, currentTriggers, maxSessions)
  }

  private async runFromTriggerMessageInternal(
    chatId: ChatId,
    triggerMessage: Message,
    maxSessions: number,
  ): Promise<{ appended: Message[]; paused: boolean; pendingParticipantIds: ParticipantId[] }> {
    const chat = await this.chatStore.getChat(chatId)

    const currentTriggers = new Map<ParticipantId, string>()
    const initialMentioned = extractMentionedParticipantIds(triggerMessage.text, chat.participants)
    for (const pid of initialMentioned) {
      if (triggerMessage.authorKind === 'agent' && triggerMessage.authorId === pid) continue
      currentTriggers.set(pid, triggerMessage.id)
    }

    return this.runSessions(chatId, chat, currentTriggers, maxSessions)
  }

  private async runSessions(
    chatId: ChatId,
    chat: { participants: Participant[] },
    currentTriggersInput: Map<ParticipantId, string>,
    maxSessions: number,
  ): Promise<{ appended: Message[]; paused: boolean; pendingParticipantIds: ParticipantId[] }> {
    const appended: Message[] = []
    let currentTriggers = currentTriggersInput

    for (let sessionIndex = 1; sessionIndex <= maxSessions; sessionIndex++) {
      if (currentTriggers.size === 0) break

      const snapshot = await this.chatStore.listMessages(chatId, 200)

      const triggersThisSession = [...currentTriggers.entries()]
      const pending = triggersThisSession.map(([participantId, triggeredByMessageId]) => {
        const promise =
          this.agentService.buildAgentMessage({
            chatId,
            participantId,
            messagesSnapshot: snapshot,
            runOpts: {
              trigger: 'mention',
              triggeredByMessageId,
              tagSessionIndex: sessionIndex,
            },
          })
        return { promise }
      })

      const replies: Message[] = []
      const remaining = [...pending]
      while (remaining.length > 0) {
        const raced = await Promise.race(
          remaining.map((p) =>
            p.promise.then((msg) => ({ pending: p, msg })),
          ),
        )
        const idx = remaining.indexOf(raced.pending)
        if (idx >= 0) remaining.splice(idx, 1)

        await this.chatStore.appendMessage(chatId, raced.msg)
        appended.push(raced.msg)
        replies.push(raced.msg)
        this.onMessageAppended?.(chatId, raced.msg)
      }

      const nextTriggers = new Map<ParticipantId, string>()
      for (const reply of replies) {
        const mentioned = extractMentionedParticipantIds(reply.text, chat.participants)
        for (const pid of mentioned) {
          // Ignore self-mentions to reduce accidental infinite loops.
          if (reply.authorKind === 'agent' && reply.authorId === pid) continue
          if (!nextTriggers.has(pid)) nextTriggers.set(pid, reply.id)
        }
      }

      currentTriggers = nextTriggers
    }

    const paused = currentTriggers.size > 0
    if (paused) this.pendingByChat.set(chatId, currentTriggers)
    this.onMentionState?.(chatId, paused, [...currentTriggers.keys()])

    return { appended, paused, pendingParticipantIds: [...currentTriggers.keys()] }
  }

  private enqueue<T>(chatId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.perChatQueue.get(chatId) ?? Promise.resolve()
    const next = prev.then(fn, fn)
    this.perChatQueue.set(chatId, next as Promise<unknown>)
    next.finally(() => {
      if (this.perChatQueue.get(chatId) === next) this.perChatQueue.delete(chatId)
    }).catch(() => undefined)
    return next
  }
}
