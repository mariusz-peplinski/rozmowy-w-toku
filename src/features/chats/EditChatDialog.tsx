import { useMemo, useState } from 'react'
import type { AgentType, Chat, Participant, RoamingConfig, UpdateChatInput } from '../../../shared/types'

type DraftParticipant = Participant & { draftId: string; roamingAck: boolean }

function newDraftId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `draft_${Math.random().toString(16).slice(2)}_${Date.now()}`
}

function newParticipantId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `a_${crypto.randomUUID()}`
  return `a_${Math.random().toString(16).slice(2)}_${Date.now()}`
}

function defaultNewParticipant(): DraftParticipant {
  return {
    draftId: newDraftId(),
    id: newParticipantId(),
    type: 'codex',
    displayName: 'New agent',
    handle: 'agent',
    colorHex: '#74d6ff',
    persona: 'You are a pragmatic AI coding agent. Be direct, rigorous, and helpful.',
    roaming: { enabled: false, mode: 'yolo' },
    roamingAck: false,
  }
}

function niceTypeLabel(t: AgentType): string {
  if (t === 'codex') return 'Codex'
  if (t === 'claude') return 'Claude'
  return 'Gemini'
}

export function EditChatDialog(props: {
  chat: Chat
  onClose: () => void
  onUpdated: (chat: Chat) => void
}) {
  const { chat, onClose, onUpdated } = props
  const [title, setTitle] = useState(chat.title)
  const [context, setContext] = useState(chat.context)
  const [participants, setParticipants] = useState<DraftParticipant[]>(
    chat.participants.map((p) => ({
      ...p,
      draftId: newDraftId(),
      roamingAck: !p.roaming.enabled,
    })),
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const roamingInvalid = useMemo(() => {
    return participants.some((p) => p.roaming.enabled && (!p.roaming.workspaceDir || !p.roamingAck))
  }, [participants])

  async function pickDir(i: number) {
    const picked = await window.api.dialog.pickDirectory()
    if (!picked) return
    setParticipants((prev) => {
      const next = [...prev]
      const p = { ...next[i] }
      p.roaming = { ...p.roaming, workspaceDir: picked }
      next[i] = p
      return next
    })
  }

  function setParticipant(i: number, patch: Partial<DraftParticipant>) {
    setParticipants((prev) => {
      const next = [...prev]
      next[i] = { ...next[i], ...patch }
      return next
    })
  }

  function removeParticipant(i: number) {
    setParticipants((prev) => prev.filter((_, idx) => idx !== i))
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const input: UpdateChatInput = {
        chatId: chat.id,
        title: title.trim() || chat.title,
        context,
        participants: participants.map((p) => ({
          id: p.id,
          type: p.type,
          displayName: p.displayName,
          handle: p.handle, // main process will keep handles stable for existing participants
          colorHex: p.colorHex,
          persona: p.persona,
          roaming: p.roaming as RoamingConfig,
        })),
      }
      const updated = await window.api.chats.update(input)
      onUpdated(updated)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="dialogBackdrop" role="dialog" aria-modal="true">
      <div className="dialog">
        <div className="dialogHeader">
          <h2 className="dialogTitle">Edit chat</h2>
          <button className="btn" onClick={onClose} disabled={saving}>
            Close
          </button>
        </div>

        <div className="formGrid">
          {error ? (
            <div className="dangerBox">
              <div style={{ marginBottom: 6 }}>Could not save chat.</div>
              <div style={{ fontFamily: 'var(--mono)' }}>{error}</div>
            </div>
          ) : null}

          <div className="row">
            <div className="field">
              <div className="fieldLabel">Title</div>
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} disabled={saving} />
            </div>
            <div className="field">
              <div className="fieldLabel">Participants</div>
              <div className="inline">
                <button className="btn" onClick={() => setParticipants((p) => [...p, defaultNewParticipant()])} disabled={saving}>
                  Add agent
                </button>
                <span style={{ color: 'var(--muted)', fontSize: 12 }}>
                  Removing agents may make old messages lose their color.
                </span>
              </div>
            </div>
          </div>

          <div className="field">
            <div className="fieldLabel">Chat context</div>
            <textarea value={context} onChange={(e) => setContext(e.target.value)} disabled={saving} />
          </div>

          {participants.map((p, i) => (
            <div className="agentCard" key={p.draftId}>
              <div className="agentCardHeader">
                <p className="agentCardTitle">
                  Agent {i + 1}: {niceTypeLabel(p.type)}
                </p>
                <button className="btn btnDanger" onClick={() => removeParticipant(i)} disabled={participants.length <= 1 || saving}>
                  Remove
                </button>
              </div>

              <div className="row">
                <div className="field">
                  <div className="fieldLabel">Type</div>
                  <select value={p.type} onChange={(e) => setParticipant(i, { type: e.target.value as AgentType })} disabled={saving}>
                    <option value="codex">Codex</option>
                    <option value="claude">Claude</option>
                    <option value="gemini">Gemini</option>
                  </select>
                </div>
                <div className="field">
                  <div className="fieldLabel">Display name</div>
                  <input type="text" value={p.displayName} onChange={(e) => setParticipant(i, { displayName: e.target.value })} disabled={saving} />
                </div>
              </div>

              <div className="row">
                <div className="field">
                  <div className="fieldLabel">Bubble color</div>
                  <div className="inline">
                    <input type="color" value={p.colorHex} onChange={(e) => setParticipant(i, { colorHex: e.target.value })} disabled={saving} aria-label="Bubble color" />
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--muted)' }}>{p.colorHex}</span>
                  </div>
                </div>
                <div className="field">
                  <div className="fieldLabel">Roaming mode</div>
                  <div className="inline">
                    <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center', fontSize: 12, color: 'var(--muted)' }}>
                      <input
                        type="checkbox"
                        checked={p.roaming.enabled}
                        onChange={(e) => {
                          const enabled = e.target.checked
                          setParticipant(i, {
                            roaming: enabled ? { enabled: true, mode: 'yolo', workspaceDir: p.roaming.workspaceDir } : { enabled: false, mode: 'yolo' },
                            roamingAck: enabled ? p.roamingAck : false,
                          })
                        }}
                        disabled={saving}
                      />
                      Enabled (dangerous)
                    </label>
                    <button className="btn" onClick={() => pickDir(i)} disabled={!p.roaming.enabled || saving}>
                      Pick directory
                    </button>
                    <span className="truncatePath" title={p.roaming.workspaceDir || undefined} style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--muted)' }}>
                      {p.roaming.workspaceDir ? p.roaming.workspaceDir : 'No directory selected'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="field">
                <div className="fieldLabel">Persona (role)</div>
                <textarea value={p.persona} onChange={(e) => setParticipant(i, { persona: e.target.value })} disabled={saving} />
              </div>

              {p.roaming.enabled ? (
                <div className="dangerBox">
                  <div style={{ marginBottom: 8 }}>
                    Roaming mode allows the agent CLI to read files and run commands under the selected directory.
                  </div>
                  <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                    <input type="checkbox" checked={p.roamingAck} onChange={(e) => setParticipant(i, { roamingAck: e.target.checked })} disabled={saving} />
                    I understand this can execute arbitrary code.
                  </label>
                </div>
              ) : null}
            </div>
          ))}

          <div className="footerActions">
            <button className="btn" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button className="btn btnPrimary" onClick={() => save()} disabled={saving || roamingInvalid}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

