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
      <DialogContent className="max-w-5xl max-h-[86vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>New chat</DialogTitle>
        </DialogHeader>

        <div className="mt-4 space-y-4">
          {error ? (
            <div className="alert alert-error">
              <div>
                <div className="font-semibold">Could not create chat</div>
                <div className="font-mono text-xs whitespace-pre-wrap">{error}</div>
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <label className="form-control w-full">
              <div className="label">
                <span className="label-text">Title (optional)</span>
              </div>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Refactor discussion"
                inputSize="default"
              />
            </label>

            <div className="space-y-2">
              <div className="label px-0">
                <span className="label-text">Participants</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setParticipants((p) => [...p, defaultParticipant()])}
                  disabled={creating}
                >
                  Add agent
                </Button>
                <span className="text-sm opacity-70">Agents are copied into the chat when created.</span>
              </div>
            </div>
          </div>

          <label className="form-control w-full">
            <div className="label">
              <span className="label-text">Chat context</span>
              <span className="label-text-alt opacity-70">Shown at the top of the chat</span>
            </div>
            <Textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="What is this discussion about? Add constraints, goals, and relevant context here."
              className="min-h-[100px]"
            />
          </label>

          {participants.map((p, i) => (
            <div className="card border border-base-300 bg-base-200" key={p.draftId}>
              <div className="card-body p-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-semibold">
                    Agent {i + 1}: {niceTypeLabel(p.type)}
                  </div>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => removeParticipant(i)}
                    disabled={participants.length <= 1 || creating}
                  >
                    Remove
                  </Button>
                </div>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <label className="form-control w-full">
                    <div className="label">
                      <span className="label-text">Type</span>
                    </div>
                    <select
                      className="select w-full border border-base-300 bg-base-100"
                      value={p.type}
                      onChange={(e) => setParticipant(i, { type: e.target.value as AgentType })}
                      disabled={creating}
                    >
                      <option value="codex">Codex</option>
                      <option value="claude">Claude</option>
                      <option value="gemini">Gemini</option>
                    </select>
                  </label>

                  <label className="form-control w-full">
                    <div className="label">
                      <span className="label-text">Display name</span>
                    </div>
                    <Input
                      value={p.displayName}
                      onChange={(e) => setParticipant(i, { displayName: e.target.value })}
                      placeholder="e.g. Reviewer"
                      disabled={creating}
                      inputSize="default"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div className="space-y-2">
                    <div className="label px-0">
                      <span className="label-text">Bubble color</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <input
                        type="color"
                        value={p.colorHex}
                        onChange={(e) => setParticipant(i, { colorHex: e.target.value })}
                        disabled={creating}
                        aria-label="Bubble color"
                        className="h-10 w-16 rounded-box border border-base-300 bg-base-100"
                      />
                      <span className="font-mono text-xs opacity-70">{p.colorHex}</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="label px-0">
                      <span className="label-text">Roaming mode</span>
                      <span className="label-text-alt opacity-70">Allows file access + commands</span>
                    </div>

                    <div className="flex flex-col gap-2">
                      <label className="label cursor-pointer justify-start gap-3 p-0">
                        <input
                          type="checkbox"
                          className="toggle toggle-warning"
                          checked={p.roaming.enabled}
                          onChange={(e) => {
                            const enabled = e.target.checked
                            setParticipant(i, {
                              roaming: enabled
                                ? { enabled: true, mode: 'yolo', workspaceDir: p.roaming.workspaceDir }
                                : { enabled: false, mode: 'yolo' },
                              roamingAck: enabled ? p.roamingAck : false,
                            })
                          }}
                          disabled={creating}
                        />
                        <span className="label-text">Enabled (dangerous)</span>
                      </label>

                      <div className="flex flex-wrap items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => pickDir(i)} disabled={!p.roaming.enabled || creating}>
                          Pick directory
                        </Button>
                        <span
                          className="min-w-0 flex-1 truncate font-mono text-xs opacity-70"
                          title={p.roaming.workspaceDir ? p.roaming.workspaceDir : undefined}
                        >
                          {p.roaming.workspaceDir ? p.roaming.workspaceDir : 'No directory selected'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <label className="form-control w-full">
                  <div className="label">
                    <span className="label-text">Persona (role)</span>
                  </div>
                  <Textarea
                    value={p.persona}
                    onChange={(e) => setParticipant(i, { persona: e.target.value })}
                    placeholder="e.g. You are a nitpicky code reviewer with a pessimistic view on everything."
                    disabled={creating}
                    className="min-h-[100px]"
                  />
                </label>

                {p.roaming.enabled ? (
                  <div className="alert alert-warning">
                    <div>
                      <div className="font-semibold">Roaming is enabled</div>
                      <div className="text-sm">
                        The agent CLI can read files and run commands under the selected directory.
                      </div>
                      <label className="label cursor-pointer justify-start gap-3 p-0 mt-2">
                        <input
                          type="checkbox"
                          className="checkbox checkbox-warning checkbox-sm"
                          checked={p.roamingAck}
                          onChange={(e) => setParticipant(i, { roamingAck: e.target.checked })}
                          disabled={creating}
                        />
                        <span className="label-text">I understand this can execute arbitrary code.</span>
                      </label>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ))}

          <div className="modal-action">
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
