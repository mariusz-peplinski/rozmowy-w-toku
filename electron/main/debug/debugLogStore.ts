import type { ChatId, DebugRunLog } from '../../../shared/types'

export class DebugLogStore {
  private readonly runsByChat = new Map<ChatId, DebugRunLog[]>()
  private readonly maxRunsPerChat: number

  constructor(maxRunsPerChat = 50) {
    this.maxRunsPerChat = maxRunsPerChat
  }

  listRuns(chatId: ChatId): DebugRunLog[] {
    const runs = this.runsByChat.get(chatId) ?? []
    // Newest first for UI.
    return [...runs].sort((a, b) => b.tsStart.localeCompare(a.tsStart))
  }

  clearRuns(chatId: ChatId): void {
    this.runsByChat.delete(chatId)
  }

  upsertRun(chatId: ChatId, run: DebugRunLog): void {
    const existing = this.runsByChat.get(chatId) ?? []
    const idx = existing.findIndex((r) => r.id === run.id)
    if (idx >= 0) existing[idx] = run
    else existing.push(run)
    // Keep bounded.
    if (existing.length > this.maxRunsPerChat) existing.splice(0, existing.length - this.maxRunsPerChat)
    this.runsByChat.set(chatId, existing)
  }
}

