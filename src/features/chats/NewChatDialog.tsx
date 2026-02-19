import { useMemo, useState } from 'react'
import type { AgentType, Chat, CreateChatInput, CreateChatParticipantInput, RoamingConfig } from '../../../shared/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type DraftParticipant = CreateChatParticipantInput & {
  draftId: string
  roamingAck: boolean
}

function newDraftId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `draft_${Math.random().toString(16).slice(2)}_${Date.now()}`
}

function defaultParticipant(): DraftParticipant {
  return {
    draftId: newDraftId(),
    type: 'codex',
    displayName: 'Codex',
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

export function NewChatDialog(props: {
  onClose: () => void
  onCreated: (chat: Chat) => void
}) {
  const { onClose, onCreated } = props
  const [title, setTitle] = useState('')
  const [context, setContext] = useState('')
  const [participants, setParticipants] = useState<DraftParticipant[]>([
    defaultParticipant(),
    {
      draftId: newDraftId(),
      type: 'claude',
      displayName: 'Claude',
      colorHex: '#ffcc00',
      persona: 'You are a careful reviewer. Question assumptions and point out risks.',
      roaming: { enabled: false, mode: 'yolo' },
      roamingAck: false,
    },
  ])
  const [creating, setCreating] = useState(false)
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

  async function create() {
    setCreating(true)
    setError(null)
    try {
      const input: CreateChatInput = {
        title: title.trim() ? title.trim() : undefined,
        context,
        participants: participants.map((p) => ({
          type: p.type,
          displayName: p.displayName,
          colorHex: p.colorHex,
          persona: p.persona,
          roaming: p.roaming as RoamingConfig,
        })),
      }
      const created = await window.api.chats.create(input)
      onCreated(created)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => {
      if (!open && !creating) onClose()
    }}>
      <DialogContent className="max-w-[980px] max-h-[86vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader className="pb-3">
          <DialogTitle className="text-base">New chat</DialogTitle>
        </DialogHeader>

        <div className="formGrid">
          {error ? (
            <div className="dangerBox">
              <div style={{ marginBottom: 6 }}>Could not create chat.</div>
              <div style={{ fontFamily: 'var(--mono)' }}>{error}</div>
            </div>
          ) : null}

          <div className="row">
            <div className="field">
              <div className="fieldLabel">Title (optional)</div>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Refactor discussion"
                inputSize="default"
              />
            </div>
            <div className="field">
              <div className="fieldLabel">Participants</div>
              <div className="inline">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setParticipants((p) => [...p, defaultParticipant()])}
                  disabled={creating}
                >
                  Add agent
                </Button>
                <span style={{ color: 'var(--muted)', fontSize: 12 }}>
                  Agents are copied into the chat when created.
                </span>
              </div>
            </div>
          </div>

          <div className="field">
            <div className="fieldLabel">Chat context</div>
            <Textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="What is this discussion about? Add constraints, goals, and relevant context here."
              className="min-h-[100px]"
            />
          </div>

          {participants.map((p, i) => (
            <div className="agentCard" key={p.draftId}>
              <div className="agentCardHeader">
                <p className="agentCardTitle">
                  Agent {i + 1}: {niceTypeLabel(p.type)}
                </p>
                <Button variant="danger" size="sm" onClick={() => removeParticipant(i)} disabled={participants.length <= 1 || creating}>
                  Remove
                </Button>
              </div>

              <div className="row">
                <div className="field">
                  <div className="fieldLabel">Type</div>
                  <Select
                    value={p.type}
                    onValueChange={(value) => setParticipant(i, { type: value as AgentType })}
                    disabled={creating}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="codex">Codex</SelectItem>
                      <SelectItem value="claude">Claude</SelectItem>
                      <SelectItem value="gemini">Gemini</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="field">
                  <div className="fieldLabel">Display name</div>
                  <Input
                    value={p.displayName}
                    onChange={(e) => setParticipant(i, { displayName: e.target.value })}
                    placeholder="e.g. Reviewer"
                    disabled={creating}
                    inputSize="default"
                  />
                </div>
              </div>

              <div className="row">
                <div className="field">
                  <div className="fieldLabel">Bubble color</div>
                  <div className="inline">
                    <input
                      type="color"
                      value={p.colorHex}
                      onChange={(e) => setParticipant(i, { colorHex: e.target.value })}
                      disabled={creating}
                      aria-label="Bubble color"
                    />
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--muted)' }}>
                      {p.colorHex}
                    </span>
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
                        disabled={creating}
                      />
                      Enabled (dangerous)
                    </label>
                    <Button variant="outline" size="sm" onClick={() => pickDir(i)} disabled={!p.roaming.enabled || creating}>
                      Pick directory
                    </Button>
                    <span
                      className="truncatePath"
                      title={p.roaming.workspaceDir ? p.roaming.workspaceDir : undefined}
                      style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--muted)' }}
                    >
                      {p.roaming.workspaceDir ? p.roaming.workspaceDir : 'No directory selected'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="field">
                <div className="fieldLabel">Persona (role)</div>
                <Textarea
                  value={p.persona}
                  onChange={(e) => setParticipant(i, { persona: e.target.value })}
                  placeholder="e.g. You are a nitpicky code reviewer with a pessimistic view on everything."
                  disabled={creating}
                  className="min-h-[100px]"
                />
              </div>

              {p.roaming.enabled ? (
                <div className="dangerBox">
                  <div style={{ marginBottom: 8 }}>
                    Roaming mode allows the agent CLI to read files and run commands under the selected directory.
                  </div>
                  <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      checked={p.roamingAck}
                      onChange={(e) => setParticipant(i, { roamingAck: e.target.checked })}
                      disabled={creating}
                    />
                    I understand this can execute arbitrary code.
                  </label>
                </div>
              ) : null}
            </div>
          ))}

          <div className="footerActions">
            <Button variant="outline" size="sm" onClick={onClose} disabled={creating}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => create()}
              disabled={creating || participants.length === 0 || roamingInvalid}
              title={roamingInvalid ? 'Roaming requires a directory and acknowledgement.' : undefined}
            >
              {creating ? 'Creating…' : 'Create chat'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
