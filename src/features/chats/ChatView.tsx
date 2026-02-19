import { useEffect, useMemo, useRef, useState } from 'react'
import type { Chat, ChatIndexEntry, Message, ParticipantId } from '../../../shared/types'
import { DebugPanel } from '../debug/DebugPanel'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

type CssVars = React.CSSProperties & Record<`--${string}`, string>

function participantColor(chat: Chat | null, authorId: ParticipantId | 'user'): string {
  if (authorId === 'user') return '#74d6ff'
  const p = chat?.participants.find((x) => x.id === authorId)
  return p?.colorHex || '#888888'
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
  const timelineRef = useRef<HTMLDivElement | null>(null)
  const typingCountsRef = useRef<Map<string, number>>(new Map())

  const headerTitle = indexEntry?.title || 'Select a chat'
  const context = chat?.context?.trim() || ''

  const participants = useMemo(() => chat?.participants ?? [], [chat])

  useEffect(() => {
    // Reset per-chat UI state when switching chats.
    setMentionPaused(false)
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
    // Keep the newest messages in view.
    // We do this on a microtask to allow React to paint first.
    queueMicrotask(() => {
      const el = timelineRef.current
      if (!el) return
      el.scrollTop = el.scrollHeight
    })
  }, [messages.length, loading, chat?.id])

  async function sendUserMessage() {
    const chatId = chat?.id
    const text = composeText.trim()
    if (!chatId || !text) return
    setSending(true)
    try {
      const res = await window.api.messages.appendUser(chatId, text)
      onMessagesChanged([...messages, ...res.messages])
      setMentionPaused(res.mentionPaused)
      setComposeText('')
      onRefresh()
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
      onMessagesChanged([...messages, ...res.messages])
      setMentionPaused(res.mentionPaused)
      onRefresh()
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
    const res = await window.api.mentions.resume(chatId)
    onMessagesChanged([...messages, ...res.messages])
    setMentionPaused(res.mentionPaused)
    onRefresh()
  }

  async function deleteMessage(messageId: string) {
    const chatId = chat?.id
    if (!chatId) return
    await window.api.messages.delete(chatId, messageId)
    const updated = await window.api.messages.list({ chatId, limit: 200 })
    onMessagesChanged(updated)
    onRefresh()
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
                      background: `linear-gradient(180deg, ${dot}33, rgba(255,255,255,0.06))`,
                      borderColor: `${dot}55`,
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
              <div className="bubbleText">{m.text}</div>
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
        <Textarea
          value={composeText}
          placeholder="Message as you… (Shift+Enter for a new line)"
          textareaSize="default"
          className="h-[88px] min-h-[88px] resize-none"
          onChange={(e) => setComposeText(e.target.value)}
          onKeyDown={(e) => {
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
