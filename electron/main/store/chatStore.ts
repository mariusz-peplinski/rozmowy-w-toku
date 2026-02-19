import fs from 'node:fs/promises'
import type {
  Chat,
  ChatId,
  ChatIndexEntry,
  CreateChatInput,
  Message,
  Participant,
  UpdateChatInput,
} from '../../../shared/types'
import { chatDir, chatMessagesFile, chatMetaFile, getDataPaths } from '../data/paths'
import { appendJsonlLine, ensureDir, pathExists, readJsonFile, readJsonlFile, writeJsonFileAtomic } from '../util/fsUtil'
import { newId, nowIso } from '../util/ids'

type ChatsIndexFile = {
  version: 1
  chats: ChatIndexEntry[]
}

function slugifyHandle(displayName: string): string {
  const base = displayName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
  return base || 'agent'
}

function uniqueHandles(participants: Array<Pick<Participant, 'displayName'>>): string[] {
  const used = new Map<string, number>()
  const handles: string[] = []
  for (const p of participants) {
    const base = slugifyHandle(p.displayName)
    const count = used.get(base) ?? 0
    used.set(base, count + 1)
    handles.push(count === 0 ? base : `${base}-${count + 1}`)
  }
  return handles
}

type MessageDeleteEvent = {
  kind: 'delete'
  id: string
  ts: string
  targetMessageId: string
}

function isDeleteEvent(x: unknown): x is MessageDeleteEvent {
  if (typeof x !== 'object' || x === null) return false
  return 'kind' in x && (x as { kind?: unknown }).kind === 'delete'
}

function ensureUniqueHandles(participants: Participant[]): Participant[] {
  // Preserve existing handles when possible; only disambiguate collisions.
  const used = new Map<string, number>()
  return participants.map((p) => {
    const base = p.handle?.trim() ? p.handle.trim() : slugifyHandle(p.displayName)
    const count = used.get(base) ?? 0
    used.set(base, count + 1)
    const handle = count === 0 ? base : `${base}-${count + 1}`
    return { ...p, handle }
  })
}

export class ChatStore {
  private readonly chatsRoot: string
  private readonly chatsIndexFile: string

  constructor(userDataPath: string) {
    const paths = getDataPaths(userDataPath)
    this.chatsRoot = paths.chatsRoot
    this.chatsIndexFile = paths.chatsIndexFile
  }

  async init(): Promise<void> {
    await ensureDir(this.chatsRoot)
    if (!(await pathExists(this.chatsIndexFile))) {
      const empty: ChatsIndexFile = { version: 1, chats: [] }
      await writeJsonFileAtomic(this.chatsIndexFile, empty)
    }
  }

  async listChats(): Promise<ChatIndexEntry[]> {
    const idx = await this.readIndex()
    // Sort by most recently updated for sidebar UX.
    return [...idx.chats].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  async getChat(chatId: ChatId): Promise<Chat> {
    return readJsonFile<Chat>(chatMetaFile(this.chatsRoot, chatId))
  }

  async createChat(input: CreateChatInput): Promise<Chat> {
    const chatId = newId('c')
    const createdAt = nowIso()
    const title = (input.title?.trim() || `New chat ${new Date().toLocaleDateString()}`).trim()

    const handles = uniqueHandles(input.participants)
    const participants: Participant[] = input.participants.map((p, i) => ({
      id: newId('a'),
      type: p.type,
      displayName: p.displayName.trim() || `Agent ${i + 1}`,
      handle: handles[i],
      colorHex: p.colorHex,
      persona: p.persona,
      roaming: p.roaming,
    }))

    const chat: Chat = {
      id: chatId,
      title,
      createdAt,
      updatedAt: createdAt,
      context: input.context,
      participants,
    }

    const dir = chatDir(this.chatsRoot, chatId)
    await ensureDir(dir)
    await writeJsonFileAtomic(chatMetaFile(this.chatsRoot, chatId), chat)
    await fs.writeFile(chatMessagesFile(this.chatsRoot, chatId), '', 'utf8')

    await this.upsertIndexEntry({
      id: chatId,
      title,
      createdAt,
      updatedAt: createdAt,
    })

    return chat
  }

  async updateChat(input: UpdateChatInput): Promise<Chat> {
    const existing = await this.getChat(input.chatId)
    const updatedAt = nowIso()

    // Keep handles stable for existing participants; for new ones, generate from displayName.
    const oldById = new Map(existing.participants.map((p) => [p.id, p]))
    const withHandles: Participant[] = input.participants.map((p) => {
      const old = oldById.get(p.id)
      if (old) return { ...p, handle: old.handle }
      return { ...p, handle: slugifyHandle(p.displayName) }
    })

    const participants = ensureUniqueHandles(withHandles)

    const next: Chat = {
      ...existing,
      title: input.title.trim() || existing.title,
      context: input.context,
      participants,
      updatedAt,
    }

    await writeJsonFileAtomic(chatMetaFile(this.chatsRoot, existing.id), next)
    await this.upsertIndexEntry({
      id: next.id,
      title: next.title,
      createdAt: next.createdAt,
      updatedAt: next.updatedAt,
    })

    return next
  }

  async appendMessage(chatId: ChatId, message: Message): Promise<void> {
    await appendJsonlLine(chatMessagesFile(this.chatsRoot, chatId), message)
    await this.touchChatIndex(chatId, message.ts)
  }

  async deleteMessage(chatId: ChatId, messageId: string): Promise<void> {
    const evt: MessageDeleteEvent = {
      kind: 'delete',
      id: newId('del'),
      ts: nowIso(),
      targetMessageId: messageId,
    }
    await appendJsonlLine(chatMessagesFile(this.chatsRoot, chatId), evt)
    await this.touchChatIndex(chatId, evt.ts)
  }

  async listMessages(chatId: ChatId, limit = 200): Promise<Message[]> {
    const file = chatMessagesFile(this.chatsRoot, chatId)
    if (!(await pathExists(file))) return []
    const all = await readJsonlFile<Message | MessageDeleteEvent>(file)
    const deleted = new Set<string>()
    const messages: Message[] = []
    for (const item of all) {
      if (isDeleteEvent(item)) {
        deleted.add(item.targetMessageId)
      } else {
        messages.push(item)
      }
    }

    const filtered = messages.filter((m) => !deleted.has(m.id))
    if (filtered.length <= limit) return filtered
    return filtered.slice(filtered.length - limit)
  }

  private async readIndex(): Promise<ChatsIndexFile> {
    return readJsonFile<ChatsIndexFile>(this.chatsIndexFile)
  }

  private async writeIndex(idx: ChatsIndexFile): Promise<void> {
    await writeJsonFileAtomic(this.chatsIndexFile, idx)
  }

  private async upsertIndexEntry(entry: ChatIndexEntry): Promise<void> {
    const idx = await this.readIndex()
    const existing = idx.chats.findIndex((c) => c.id === entry.id)
    if (existing >= 0) idx.chats[existing] = entry
    else idx.chats.push(entry)
    await this.writeIndex(idx)
  }

  private async touchChatIndex(chatId: ChatId, updatedAt: string): Promise<void> {
    const idx = await this.readIndex()
    const existing = idx.chats.find((c) => c.id === chatId)
    if (!existing) return
    existing.updatedAt = updatedAt
    await this.writeIndex(idx)
  }
}
