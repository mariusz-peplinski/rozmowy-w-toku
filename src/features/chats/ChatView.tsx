import { useEffect, useMemo, useRef, useState } from 'react'
import type { Chat, ChatIndexEntry, Message, ParticipantId } from '../../../shared/types'
import { DebugPanel } from '../debug/DebugPanel'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

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

function renderWithMentions(text: string, mentionTokens: string[]): React.ReactNode {
  if (!text) return text
  const tokens = mentionTokens.map((t) => ({ raw: t, lower: t.toLowerCase() }))
  if (tokens.length === 0) return text

  const lower = text.toLowerCase()
  const chunks: React.ReactNode[] = []
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

    let matched: { raw: string; lower: string } | null = null
    for (const t of tokens) {
      if (lower.startsWith(t.lower, i)) {
        matched = t
        break
      }
    }
    if (!matched) {
      i += 1
      continue
    }

    if (cursor < i) chunks.push(text.slice(cursor, i))
    const end = i + matched.raw.length
    chunks.push(
      <strong key={`m_${i}_${end}`} className="mentionText">
        {text.slice(i, end)}
      </strong>,
    )
    cursor = end
    i = end
  }

  if (cursor < text.length) chunks.push(text.slice(cursor))
  return chunks.length > 0 ? chunks : text
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
    () =>
      participants.map((p) => ({
        participantId: p.id,
        label: `${p.displayName} (@${p.handle})`,
        insertText: `@${p.handle}`,
      })),
    [participants],
  )
  const mentionTokens = useMemo(() => {
    const unique = new Set<string>()
    for (const p of participants) {
      if (p.handle.trim()) unique.add(`@${p.handle}`)
      if (p.displayName.trim()) unique.add(`@${p.displayName.trim()}`)
    }
    return [...unique].sort((a, b) => b.length - a.length)
  }, [participants])
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
      <div className="emptyState">
        <div>
          <div style={{ marginBottom: 8 }}>Pick a chat on the left, or create a new one.</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            Agents will show up here once configured per chat.
          </div>
          <div style={{ marginTop: 14, display: 'flex', justifyContent: 'center' }}>
            <Button variant="primary" size="sm" onClick={onOpenNewChat}>
              New chat
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <header className="mainHeader">
        <div style={{ minWidth: 0 }}>
          <h1 className="mainHeaderTitle">{headerTitle}</h1>
          <div className="mainHeaderContext" title={context || undefined}>
            {context ? context : 'No context set for this chat.'}
          </div>
        </div>
        <div className="participantsBar">
          <Button variant="outline" size="sm" onClick={onEditChat} title="Edit chat context and participants">
            Edit
          </Button>
          <Button variant="outline" size="sm" onClick={() => setDebugOpen((v) => !v)} title="Show provider commands and outputs">
            {debugOpen ? 'Hide debug' : 'Debug'}
          </Button>
          {participants.map((p) => (
            <div
              key={p.id}
              className={`pill ${typingAgents.has(p.id) ? 'pillDisabled' : ''}`}
              title={p.roaming.enabled ? 'Roaming enabled' : 'Run agent'}
              style={{ '--dot': p.colorHex } as CssVars}
              role="button"
              tabIndex={0}
              onClick={() => {
                if (typingAgents.has(p.id)) return
                runAgent(p.id).catch(() => undefined)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  if (typingAgents.has(p.id)) return
                  runAgent(p.id).catch(() => undefined)
                }
              }}
            >
              <span className="pillDot" />
              <span>{typingAgents.has(p.id) ? `${p.displayName}…` : p.displayName}</span>
            </div>
          ))}
        </div>
      </header>

      <DebugPanel chatId={chat.id} open={debugOpen} />

      <div className="timeline" ref={timelineRef}>
        {loading ? (
          <div style={{ color: 'var(--muted)' }}>Loading…</div>
        ) : messages.length === 0 ? (
          <div style={{ color: 'var(--muted)' }}>No messages yet. Say something to start.</div>
        ) : null}

        {messages.map((m) => {
          const dot = participantColor(chat, m.authorId)
          const isMe = m.authorKind === 'user'
          return (
            <div
              key={m.id}
              className={`bubble ${isMe ? 'bubbleMe' : ''}`}
              style={
                m.authorKind === 'agent'
                  ? ({
                      background: `color-mix(in srgb, ${dot}, var(--panel) 82%)`,
                      borderColor: `${dot}aa`,
                    } as CssVars)
                  : undefined
              }
            >
              <div className="bubbleHeader">
                <div className="bubbleAuthor" style={{ '--dot': dot } as CssVars}>
                  <span className="bubbleAuthorDot" />
                  <span>{m.authorDisplayName}</span>
                </div>
                <div className="bubbleRight">
                  <button className="bubbleDelete" onClick={() => deleteMessage(m.id).catch(() => undefined)}>
                    Delete
                  </button>
                  <div className="bubbleTs">{new Date(m.ts).toLocaleString()}</div>
                </div>
              </div>
              <div className="bubbleText">{renderWithMentions(m.text, mentionTokens)}</div>
            </div>
          )
        })}

        {typingAgents.size > 0 ? (
          <div className="typingLine">
            <span className="typingDots" aria-hidden="true" />
            <span style={{ color: 'var(--muted)', fontSize: 12 }}>
              {typingAgents.size === 1 ? 'Agent is typing' : 'Agents are typing'}
            </span>
          </div>
        ) : null}
      </div>

      <div className="composer">
        {mentionPaused ? (
          <div className="resumeBar">
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>
              Auto replies paused (mention limit reached).
            </div>
            <Button variant="outline" size="sm" onClick={() => resumeMentions().catch(() => undefined)}>
              Let them continue
            </Button>
          </div>
        ) : null}

        {mentionQuery && filteredMentionOptions.length > 0 ? (
          <div className="mentionMenu" role="listbox" aria-label="Mention suggestions">
            {filteredMentionOptions.map((option, i) => (
              <button
                key={option.participantId}
                className={`mentionMenuItem ${i === mentionIndex ? 'mentionMenuItemActive' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault()
                  insertMention(option)
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}

        <Textarea
          ref={textareaRef}
          value={composeText}
          placeholder="Message as you… (Shift+Enter for a new line)"
          textareaSize="default"
          className="h-[88px] min-h-[88px] resize-none"
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
        <Button variant="primary" size="default" disabled={!composeText.trim() || sending} onClick={() => sendUserMessage()}>
          {sending ? 'Sending…' : 'Send'}
        </Button>
      </div>
    </>
  )
}

