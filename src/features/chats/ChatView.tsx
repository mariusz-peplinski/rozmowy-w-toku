import { useEffect, useMemo, useRef, useState } from 'react'
import type { Chat, ChatIndexEntry, Message, ParticipantId } from '../../../shared/types'
import { DebugPanel } from '../debug/DebugPanel'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { visit } from 'unist-util-visit'
import type { Content, Parent, Root } from 'mdast'

type CssVars = React.CSSProperties & Record<`--${string}`, string>

type MentionQuery = {
  start: number
  end: number
  query: string
}

type MentionOption = {
  participantId: string
  label: string
  insertText: string
}

type MentionToken = {
  raw: string
  lower: string
}

type MentionSegment =
  | { kind: 'text'; value: string }
  | { kind: 'mention'; value: string }

function participantColor(chat: Chat | null, authorId: ParticipantId | 'user'): string {
  if (authorId === 'user') return '#d9dde3'
  const p = chat?.participants.find((x) => x.id === authorId)
  return p?.colorHex || '#888888'
}

function mergeMessages(existing: Message[], incoming: Message[]): Message[] {
  if (incoming.length === 0) return existing
  const byId = new Map(existing.map((m) => [m.id, m]))
  for (const m of incoming) byId.set(m.id, m)
  return [...byId.values()].sort((a, b) => a.ts.localeCompare(b.ts))
}

function findMentionQuery(text: string, caret: number): MentionQuery | null {
  const head = text.slice(0, caret)
  const m = head.match(/(?:^|\s)@([a-z0-9-]*)$/i)
  if (!m) return null
  const query = m[1] ?? ''
  const start = caret - query.length - 1
  return { start, end: caret, query }
}

function isBoundaryChar(ch: string): boolean {
  return /\s|[([{'"`]|[.,;:!?]/.test(ch)
}

function normalizeMentionTokens(mentionTokens: string[]): MentionToken[] {
  return mentionTokens
    .filter(Boolean)
    .map((t) => ({ raw: t, lower: t.toLowerCase() }))
    .sort((a, b) => b.raw.length - a.raw.length)
}

function splitMentionSegments(text: string, mentionTokens: MentionToken[]): MentionSegment[] {
  if (!text || mentionTokens.length === 0) return [{ kind: 'text', value: text }]
  const lower = text.toLowerCase()
  const parts: MentionSegment[] = []
  let cursor = 0
  let i = 0

  while (i < text.length) {
    if (text[i] !== '@') {
      i += 1
      continue
    }
    if (i > 0 && !isBoundaryChar(text[i - 1]!)) {
      i += 1
      continue
    }

    let matched: MentionToken | null = null
    for (const t of mentionTokens) {
      if (lower.startsWith(t.lower, i)) {
        const end = i + t.raw.length
        if (end < text.length && !isBoundaryChar(text[end]!)) continue
        matched = t
        break
      }
    }
    if (!matched) {
      i += 1
      continue
    }

    if (cursor < i) parts.push({ kind: 'text', value: text.slice(cursor, i) })
    const end = i + matched.raw.length
    parts.push({ kind: 'mention', value: text.slice(i, end) })
    cursor = end
    i = end
  }

  if (cursor < text.length) parts.push({ kind: 'text', value: text.slice(cursor) })
  return parts.length > 0 ? parts : [{ kind: 'text', value: text }]
}

function createMentionRemarkPlugin(mentionTokens: string[]) {
  const normalized = normalizeMentionTokens(mentionTokens)
  return () => (tree: Root) => {
    if (normalized.length === 0) return
    visit(tree, 'text', (node, index, parent) => {
      const parentNode = parent as Parent | undefined
      if (typeof index !== 'number' || !parentNode) return
      if (parentNode.type === 'link' || parentNode.type === 'inlineCode') return

      const parts = splitMentionSegments((node.value as string) ?? '', normalized)
      if (parts.length === 1 && parts[0]?.kind === 'text') return

      const replaced: Content[] = parts.map((part) => {
        if (part.kind === 'text') return { type: 'text', value: part.value }
        return {
          type: 'link',
          url: `mention:${part.value.slice(1).toLowerCase()}`,
          title: null,
          children: [{ type: 'text', value: part.value }],
        }
      })

      parentNode.children.splice(index, 1, ...replaced)
      return index + replaced.length
    })
  }
}

export function ChatView(props: {
  indexEntry: ChatIndexEntry | null
  chat: Chat | null
  messages: Message[]
  loading: boolean
  onRefresh: () => void
  onMessagesChanged: (messages: Message[]) => void
  onOpenNewChat: () => void
  onEditChat: () => void
}) {
  const { indexEntry, chat, messages, loading, onMessagesChanged, onRefresh, onOpenNewChat, onEditChat } = props
  const [composeText, setComposeText] = useState('')
  const [sending, setSending] = useState(false)
  const [typingAgents, setTypingAgents] = useState<Set<string>>(() => new Set())
  const [debugOpen, setDebugOpen] = useState(false)
  const [mentionPaused, setMentionPaused] = useState(false)
  const [mentionQuery, setMentionQuery] = useState<MentionQuery | null>(null)
  const [mentionIndex, setMentionIndex] = useState(0)
  const timelineRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const typingCountsRef = useRef<Map<string, number>>(new Map())
  const messagesRef = useRef<Message[]>(messages)
  const onMessagesChangedRef = useRef(onMessagesChanged)
  const onRefreshRef = useRef(onRefresh)

  const headerTitle = indexEntry?.title || 'Select a chat'
  const context = chat?.context?.trim() || ''

  const participants = useMemo(() => chat?.participants ?? [], [chat])
  const mentionOptions = useMemo<MentionOption[]>(
    () => [
      { participantId: '__everyone__', label: 'everyone (all agents)', insertText: '@everyone' },
      ...participants.map((p) => ({
        participantId: p.id,
        label: `${p.displayName} (@${p.handle})`,
        insertText: `@${p.handle}`,
      })),
    ],
    [participants],
  )
  const mentionTokens = useMemo(() => {
    const unique = new Set<string>(['@everyone'])
    for (const p of participants) {
      if (p.handle.trim()) unique.add(`@${p.handle}`)
      if (p.displayName.trim()) unique.add(`@${p.displayName.trim()}`)
    }
    return [...unique].sort((a, b) => b.length - a.length)
  }, [participants])
  const mentionColorByToken = useMemo(() => {
    const map = new Map<string, string>()
    map.set('@everyone', '#f59e0b')
    for (const p of participants) {
      const color = p.colorHex || '#f59e0b'
      if (p.handle.trim()) map.set(`@${p.handle.trim().toLowerCase()}`, color)
      if (p.displayName.trim()) map.set(`@${p.displayName.trim().toLowerCase()}`, color)
    }
    return map
  }, [participants])
  const mentionRemarkPlugin = useMemo(() => createMentionRemarkPlugin(mentionTokens), [mentionTokens])
  const filteredMentionOptions = useMemo(() => {
    if (!mentionQuery) return []
    const q = mentionQuery.query.toLowerCase()
    const filtered = mentionOptions.filter((o) => o.insertText.toLowerCase().includes(q) || o.label.toLowerCase().includes(q))
    return filtered.slice(0, 8)
  }, [mentionOptions, mentionQuery])

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  useEffect(() => {
    onMessagesChangedRef.current = onMessagesChanged
  }, [onMessagesChanged])

  useEffect(() => {
    onRefreshRef.current = onRefresh
  }, [onRefresh])

  useEffect(() => {
    // Reset per-chat UI state when switching chats.
    setMentionPaused(false)
    setMentionQuery(null)
    setMentionIndex(0)
    typingCountsRef.current.clear()
    setTypingAgents(new Set())
  }, [chat?.id])

  useEffect(() => {
    if (!chat) return
    // Agent runs happen in the main process (including mention fan-out).
    // Subscribe to status events so the UI can show "typing…" while a CLI is running.
    const off = window.api.events.onAgentRunStatus((evt) => {
      if (evt.chatId !== chat.id) return
      const counts = typingCountsRef.current
      const current = counts.get(evt.participantId) ?? 0
      if (evt.status === 'running') counts.set(evt.participantId, current + 1)
      else counts.set(evt.participantId, Math.max(0, current - 1))

      const next = new Set<string>()
      for (const [pid, c] of counts.entries()) {
        if (c > 0) next.add(pid)
      }
      setTypingAgents(next)
    })
    return off
  }, [chat])

  useEffect(() => {
    if (!chat) return
    const offMessage = window.api.events.onMessageAppended((evt) => {
      if (evt.chatId !== chat.id) return
      const updated = mergeMessages(messagesRef.current, [evt.message])
      messagesRef.current = updated
      onMessagesChangedRef.current(updated)
      onRefreshRef.current()
    })
    const offMentionState = window.api.events.onMentionState((evt) => {
      if (evt.chatId !== chat.id) return
      setMentionPaused(evt.mentionPaused)
    })
    return () => {
      offMessage()
      offMentionState()
    }
  }, [chat])

  useEffect(() => {
    // Keep the newest messages in view.
    // We do this on a microtask to allow React to paint first.
    queueMicrotask(() => {
      const el = timelineRef.current
      if (!el) return
      el.scrollTop = el.scrollHeight
    })
  }, [messages.length, loading, chat?.id, typingAgents.size])

  function applyIncomingMessages(incoming: Message[]): void {
    const updated = mergeMessages(messagesRef.current, incoming)
    messagesRef.current = updated
    onMessagesChangedRef.current(updated)
  }

  function insertMention(option: MentionOption): void {
    const query = mentionQuery
    if (!query) return
    const withSpace = `${option.insertText} `
    const next = `${composeText.slice(0, query.start)}${withSpace}${composeText.slice(query.end)}`
    const caret = query.start + withSpace.length
    setComposeText(next)
    setMentionQuery(null)
    setMentionIndex(0)
    queueMicrotask(() => {
      const el = textareaRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(caret, caret)
    })
  }

  async function sendUserMessage() {
    const chatId = chat?.id
    const text = composeText.trim()
    if (!chatId || !text) return
    setSending(true)
    setComposeText('')
    setMentionQuery(null)
    setMentionIndex(0)
    try {
      const res = await window.api.messages.appendUser(chatId, text)
      applyIncomingMessages(res.messages)
      setMentionPaused(res.mentionPaused)
      onRefreshRef.current()
    } finally {
      setSending(false)
    }
  }

  async function runAgent(participantId: string) {
    const chatId = chat?.id
    if (!chatId) return
    // Optimistic typing state in case the CLI takes a moment to start.
    typingCountsRef.current.set(participantId, (typingCountsRef.current.get(participantId) ?? 0) + 1)
    setTypingAgents((prev) => new Set(prev).add(participantId))
    try {
      const res = await window.api.agents.run(chatId, participantId, { trigger: 'manual' })
      applyIncomingMessages(res.messages)
      setMentionPaused(res.mentionPaused)
      onRefreshRef.current()
    } finally {
      // The main-process status event should clear it too; this just avoids "stuck typing" if events are missed.
      typingCountsRef.current.set(participantId, Math.max(0, (typingCountsRef.current.get(participantId) ?? 1) - 1))
      const next = new Set<string>()
      for (const [pid, c] of typingCountsRef.current.entries()) {
        if (c > 0) next.add(pid)
      }
      setTypingAgents(next)
    }
  }

  async function resumeMentions() {
    const chatId = chat?.id
    if (!chatId) return
    setMentionPaused(false)
    const res = await window.api.mentions.resume(chatId)
    applyIncomingMessages(res.messages)
    setMentionPaused(res.mentionPaused)
    onRefreshRef.current()
  }

  async function deleteMessage(messageId: string) {
    const chatId = chat?.id
    if (!chatId) return
    await window.api.messages.delete(chatId, messageId)
    const updated = await window.api.messages.list({ chatId, limit: 200 })
    messagesRef.current = updated
    onMessagesChangedRef.current(updated)
    onRefreshRef.current()
  }

  if (!chat) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-3">
          <div className="text-xl font-bold">Pick a chat</div>
          <div className="text-sm opacity-70">
            Choose a chat from the sidebar, or create a new one to start a multi-agent conversation.
          </div>
          <div>
            <Button variant="primary" size="sm" onClick={onOpenNewChat}>
              New chat
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="sticky top-0 z-10 border-b border-base-300 bg-base-100 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h1 className="text-lg font-bold truncate">{headerTitle}</h1>
            <div className="mt-1 text-sm opacity-70 truncate" title={context || undefined}>
              {context ? context : 'No context set for this chat.'}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onEditChat} title="Edit chat context and participants">
              Edit
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDebugOpen((v) => !v)}
              title="Show provider commands and outputs"
            >
              {debugOpen ? 'Hide debug' : 'Debug'}
            </Button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {participants.map((p) => (
            <button
              key={p.id}
              className={`btn btn-sm ${typingAgents.has(p.id) ? 'btn-disabled' : 'btn-outline'}`}
              title={p.roaming.enabled ? 'Roaming enabled' : 'Run agent'}
              onClick={() => {
                if (typingAgents.has(p.id)) return
                runAgent(p.id).catch(() => undefined)
              }}
            >
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: p.colorHex } as CssVars} />
              <span className="max-w-[14rem] truncate">
                {typingAgents.has(p.id) ? `${p.displayName}…` : p.displayName}
              </span>
              {p.roaming.enabled ? <span className="badge badge-warning badge-sm">roam</span> : null}
            </button>
          ))}
        </div>

        <div className="mt-2 text-xs opacity-70">
          Tip: click an agent button to ask that specific agent to respond.
        </div>
      </header>

      <DebugPanel chatId={chat.id} open={debugOpen} />

      <div className="flex-1 min-h-0 overflow-auto p-4 space-y-4 bg-base-200" ref={timelineRef}>
        {loading ? (
          <div className="flex items-center gap-2 opacity-70">
            <span className="loading loading-spinner loading-sm" aria-hidden="true" />
            <span className="text-sm">Loading…</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="text-sm opacity-70">No messages yet. Say something to start.</div>
        ) : null}

        {messages.map((m) => {
          const dot = participantColor(chat, m.authorId)
          const isMe = m.authorKind === 'user'
          return (
            <div key={m.id} className={`chat group ${isMe ? 'chat-end' : 'chat-start'}`}>
              <div className="chat-header flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: dot } as CssVars} />
                  <span className="font-semibold">{m.authorDisplayName}</span>
                </span>
                <time className="text-[11px] opacity-60">{new Date(m.ts).toLocaleString()}</time>
                <button
                  className="btn btn-ghost btn-xs opacity-0 group-hover:opacity-100"
                  onClick={() => deleteMessage(m.id).catch(() => undefined)}
                >
                  Delete
                </button>
              </div>
              <div
                className={
                  isMe
                    ? 'chat-bubble chat-bubble-primary'
                    : 'chat-bubble bg-base-100 text-base-content border border-base-300 border-l-4'
                }
                style={!isMe ? ({ borderLeftColor: dot } as React.CSSProperties) : undefined}
              >
                <div className="markdownBody">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, mentionRemarkPlugin]}
                    components={{
                      a: ({ href, children }) => {
                        if (href?.startsWith('mention:')) {
                          const text = (Array.isArray(children) ? children.join('') : String(children ?? '')).trim()
                          const fromHref = `@${href.slice('mention:'.length).trim().toLowerCase()}`
                          const fromText = text.toLowerCase()
                          const color = mentionColorByToken.get(fromText) || mentionColorByToken.get(fromHref) || '#f59e0b'
                          return (
                            <span
                              className="badge badge-outline font-semibold"
                              style={{ color, borderColor: `${color}aa`, backgroundColor: `${color}22` }}
                            >
                              {children}
                            </span>
                          )
                        }
                        return (
                          <a href={href} className="link link-primary" target="_blank" rel="noreferrer noopener">
                            {children}
                          </a>
                        )
                      },
                      pre: ({ children }) => (
                        <pre className="rounded-box bg-base-300 border border-base-300 p-3 overflow-x-auto">{children}</pre>
                      ),
                      code: ({ className, children, ...props }) => (
                        <code className={className ? `font-mono ${className}` : 'font-mono'} {...props}>
                          {children}
                        </code>
                      ),
                    }}
                  >
                    {m.text}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          )
        })}

        {typingAgents.size > 0 ? (
          <div className="flex items-center gap-2 opacity-70">
            <span className="loading loading-dots loading-sm" aria-hidden="true" />
            <span className="text-sm">{typingAgents.size === 1 ? 'Agent is typing' : 'Agents are typing'}…</span>
          </div>
        ) : null}
      </div>

      <div className="border-t border-base-300 bg-base-100 p-4">
        <div className="space-y-3">
          {mentionPaused ? (
            <div className="alert alert-warning">
              <div>
                <div className="font-semibold">Auto replies paused</div>
                <div className="text-sm">Mention limit reached.</div>
              </div>
              <Button variant="outline" size="sm" onClick={() => resumeMentions().catch(() => undefined)}>
                Let them continue
              </Button>
            </div>
          ) : null}

          {mentionQuery && filteredMentionOptions.length > 0 ? (
            <div className="rounded-box border border-base-300 bg-base-100 shadow w-full p-1">
              <ul className="menu menu-md w-full max-h-56 overflow-auto">
                {filteredMentionOptions.map((option, i) => (
                  <li key={option.participantId}>
                    <button
                      className={i === mentionIndex ? 'active font-semibold' : undefined}
                      style={{ paddingBlock: '0.65rem' }}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        insertMention(option)
                      }}
                    >
                      {option.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
            <Textarea
              ref={textareaRef}
              value={composeText}
              placeholder="Message as you… (Shift+Enter for a new line)"
              textareaSize="default"
              className="h-24 min-h-24 resize-none"
              onChange={(e) => {
                const next = e.target.value
                setComposeText(next)
                const caret = e.target.selectionStart ?? next.length
                const detected = findMentionQuery(next, caret)
                setMentionQuery(detected)
                setMentionIndex(0)
              }}
              onKeyDown={(e) => {
                if (mentionQuery && filteredMentionOptions.length > 0) {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    setMentionIndex((prev) => (prev + 1) % filteredMentionOptions.length)
                    return
                  }
                  if (e.key === 'ArrowUp') {
                    e.preventDefault()
                    setMentionIndex((prev) => (prev - 1 + filteredMentionOptions.length) % filteredMentionOptions.length)
                    return
                  }
                  if (e.key === 'Enter' || e.key === 'Tab') {
                    e.preventDefault()
                    insertMention(filteredMentionOptions[mentionIndex]!)
                    return
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault()
                    setMentionQuery(null)
                    return
                  }
                }

                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  sendUserMessage().catch(() => undefined)
                }
              }}
            />
            <Button
              variant="primary"
              size="default"
              disabled={!composeText.trim() || sending}
              onClick={() => sendUserMessage()}
            >
              {sending ? 'Sending…' : 'Send'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
