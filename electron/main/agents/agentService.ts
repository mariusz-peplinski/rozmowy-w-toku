import type { AgentRunOptions, ChatId, Message, ParticipantId } from '../../../shared/types'
import { buildAgentPrompt } from './prompt'
import { runProviderDetailed } from '../providers/providers'
import { chatWorkspaceDir, getDataPaths } from '../data/paths'
import { ensureDir } from '../util/fsUtil'
import { newId, nowIso } from '../util/ids'
import type { ChatStore } from '../store/chatStore'
import type { DebugLogStore } from '../debug/debugLogStore'
import type { DebugRunLog } from '../../../shared/types'

export class AgentService {
  private readonly userDataPath: string
  private readonly chatStore: ChatStore
  private readonly chatsRoot: string
  private readonly debugLogStore?: DebugLogStore
  private readonly onRunStatus?: (evt: import('../../../shared/types').AgentRunStatusEvent) => void

  constructor(opts: {
    userDataPath: string
    chatStore: ChatStore
    debugLogStore?: DebugLogStore
    onRunStatus?: (evt: import('../../../shared/types').AgentRunStatusEvent) => void
  }) {
    this.userDataPath = opts.userDataPath
    this.chatStore = opts.chatStore
    this.chatsRoot = getDataPaths(this.userDataPath).chatsRoot
    this.debugLogStore = opts.debugLogStore
    this.onRunStatus = opts.onRunStatus
  }

  async runAgent(chatId: ChatId, participantId: ParticipantId, runOpts: AgentRunOptions = {}): Promise<Message> {
    const chat = await this.chatStore.getChat(chatId)
    const participant = chat.participants.find((p) => p.id === participantId)
    if (!participant) throw new Error(`Unknown participant: ${participantId}`)

    const messages = await this.chatStore.listMessages(chatId, 200)
    const msg = await this.buildAgentMessage({ chatId, participantId, messagesSnapshot: messages, runOpts })
    await this.chatStore.appendMessage(chatId, msg)
    return msg
  }

  async buildAgentMessage(opts: {
    chatId: ChatId
    participantId: ParticipantId
    messagesSnapshot: Message[]
    runOpts: AgentRunOptions
  }): Promise<Message> {
    const { chatId, participantId, messagesSnapshot, runOpts } = opts

    const chat = await this.chatStore.getChat(chatId)
    const participant = chat.participants.find((p) => p.id === participantId)
    if (!participant) throw new Error(`Unknown participant: ${participantId}`)

    const prompt = buildAgentPrompt({ chat, participant, messages: messagesSnapshot })

    const defaultWorkDir = chatWorkspaceDir(this.chatsRoot, chatId)
    await ensureDir(defaultWorkDir)

    const roamingWorkDir = participant.roaming.enabled ? participant.roaming.workspaceDir : undefined

    let text: string
    const runId = newId('run')
    let debugRun: DebugRunLog | undefined
    try {
      const detailed = await runProviderDetailed({
        type: participant.type,
        prompt,
        roaming: participant.roaming,
        defaultWorkDir,
        roamingWorkDir,
        onStart: (info) => {
          const started: DebugRunLog = {
            id: runId,
            chatId,
            participantId: participant.id,
            participantDisplayName: participant.displayName,
            provider: participant.type,
            trigger: runOpts.trigger ?? 'manual',
            triggeredByMessageId: runOpts.triggeredByMessageId,
            tagSessionIndex: runOpts.tagSessionIndex,
            status: 'running',
            tsStart: nowIso(),
            command: info.command,
            args: info.args,
            cwd: info.cwd,
            timeoutMs: info.timeoutMs,
            roaming: participant.roaming,
            promptLength: prompt.length,
            promptPreview: prompt.slice(0, 4000),
          }
          debugRun = started
          this.debugLogStore?.upsertRun(chatId, started)

          this.onRunStatus?.({
            runId,
            chatId,
            participantId: participant.id,
            participantDisplayName: participant.displayName,
            status: 'running',
            ts: nowIso(),
            provider: participant.type,
          })
        },
      })
      text = detailed.text
      if (detailed.exec.timedOut) {
        const timeoutMsg = `${participant.type} timed out after ${Math.round(detailed.exec.timeoutMs / 1000)}s`
        if (!text) text = timeoutMsg
        if (debugRun) debugRun.error = timeoutMsg
      } else if ((detailed.exec.exitCode ?? 0) !== 0 && !text) {
        const exitMsg = `${participant.type} exited with code ${detailed.exec.exitCode}`
        text = exitMsg
        if (debugRun) debugRun.error = exitMsg
      }
      if (debugRun) {
        const run = debugRun
        const finished: DebugRunLog = {
          ...run,
          status: detailed.exec.timedOut ? 'timeout' : 'finished',
          tsEnd: nowIso(),
          stdout: detailed.exec.stdout,
          stderr: detailed.exec.stderr,
          exitCode: detailed.exec.exitCode,
          timedOut: detailed.exec.timedOut,
          signal: detailed.exec.signal,
        }
        this.debugLogStore?.upsertRun(chatId, finished)
      }

      this.onRunStatus?.({
        runId,
        chatId,
        participantId: participant.id,
        participantDisplayName: participant.displayName,
        status: detailed.exec.timedOut ? 'timeout' : 'finished',
        ts: nowIso(),
        provider: participant.type,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      text = `Error running ${participant.type}: ${msg}`
      const errRun: DebugRunLog = debugRun ?? {
        id: runId,
        chatId,
        participantId: participant.id,
        participantDisplayName: participant.displayName,
        provider: participant.type,
        trigger: runOpts.trigger ?? 'manual',
        triggeredByMessageId: runOpts.triggeredByMessageId,
        tagSessionIndex: runOpts.tagSessionIndex,
        status: 'error',
        tsStart: nowIso(),
        command: participant.type,
        args: [],
        cwd: roamingWorkDir ?? defaultWorkDir,
        timeoutMs: participant.roaming.enabled ? 240_000 : 90_000,
        roaming: participant.roaming,
        promptLength: prompt.length,
        promptPreview: prompt.slice(0, 4000),
      }
      this.debugLogStore?.upsertRun(chatId, { ...errRun, status: 'error', tsEnd: nowIso(), error: msg })

      this.onRunStatus?.({
        runId,
        chatId,
        participantId: participant.id,
        participantDisplayName: participant.displayName,
        status: 'error',
        ts: nowIso(),
        provider: participant.type,
      })
    }

    const msg: Message = {
      id: newId('m'),
      ts: nowIso(),
      authorKind: 'agent',
      authorId: participant.id,
      authorDisplayName: participant.displayName,
      text,
      meta: {
        trigger: runOpts.trigger ?? 'manual',
        triggeredByMessageId: runOpts.triggeredByMessageId,
        tagSessionIndex: runOpts.tagSessionIndex,
        provider: participant.type,
      },
    }
    return msg
  }
}
