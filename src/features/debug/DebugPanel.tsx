import { useCallback, useEffect, useState } from 'react'
import type { ChatId, DebugRunLog } from '../../../shared/types'
import { Button } from '@/components/ui/button'

function short(text: string, max = 180): string {
  const t = text.trim()
  if (t.length <= max) return t
  return t.slice(0, max) + '…'
}

function statusLabel(run: DebugRunLog): string {
  if (run.status === 'running') return 'running'
  if (run.status === 'timeout') return 'timeout'
  if (run.status === 'error') return 'error'
  return 'finished'
}

export function DebugPanel(props: {
  chatId: ChatId
  open: boolean
}) {
  const { chatId, open } = props
  const [runs, setRuns] = useState<DebugRunLog[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const next = await window.api.debug.listRuns(chatId)
      setRuns(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [chatId])

  const clear = useCallback(async () => {
    await window.api.debug.clearRuns(chatId)
    await refresh()
  }, [chatId, refresh])

  useEffect(() => {
    if (!open) return
    refresh().catch(() => undefined)
    // Poll while open so "stuck" runs are visible immediately.
    const id = window.setInterval(() => refresh().catch(() => undefined), 1000)
    return () => window.clearInterval(id)
  }, [open, refresh])

  if (!open) return null

  const badgeClass = (status: DebugRunLog['status']): string => {
    if (status === 'running') return 'badge-warning'
    if (status === 'error') return 'badge-error'
    if (status === 'timeout') return 'badge-warning'
    return 'badge-success'
  }

  return (
    <div className="border-b border-base-300 bg-base-100 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold opacity-70">Debug</div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => refresh()} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </Button>
          <Button variant="danger" size="sm" onClick={() => clear()} disabled={loading}>
            Clear
          </Button>
        </div>
      </div>

      {error ? (
        <div className="alert alert-error">
          <div className="font-mono text-xs whitespace-pre-wrap">{error}</div>
        </div>
      ) : null}

      {runs.length === 0 ? (
        <div className="text-sm opacity-70">
          No runs yet. Click an agent to see the executed command, prompt, and output here.
        </div>
      ) : null}

      <div className="space-y-2">
        {runs.map((r) => (
          <details key={r.id} className="collapse collapse-arrow border border-base-300 bg-base-200" open={r.status === 'running'}>
            <summary className="collapse-title">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`badge ${badgeClass(r.status)}`}>{statusLabel(r)}</span>
                <span className="font-mono text-xs opacity-80">{r.provider}</span>
                <span className="text-sm font-semibold">{r.participantDisplayName}</span>
                <span className="text-[11px] opacity-60">
                  {new Date(r.tsStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
                <span className="text-[11px] opacity-60">
                  {r.trigger === 'mention' ? `mention s${r.tagSessionIndex ?? '?'}` : 'manual'}
                </span>
              </div>
            </summary>

            <div className="collapse-content space-y-3">
              <div>
                <div className="text-xs font-semibold opacity-70">Command</div>
                <pre className="rounded-box bg-base-300 border border-base-300 p-3 font-mono text-xs overflow-auto">
                  {[r.command, ...r.args].join(' ')}
                </pre>
              </div>

              <div>
                <div className="text-xs font-semibold opacity-70">cwd</div>
                <pre className="rounded-box bg-base-300 border border-base-300 p-3 font-mono text-xs overflow-auto">{r.cwd}</pre>
              </div>

              <div>
                <div className="text-xs font-semibold opacity-70">Prompt (preview)</div>
                <div className="text-[11px] opacity-60 mb-1">{r.promptLength.toLocaleString()} chars</div>
                <pre className="rounded-box bg-base-300 border border-base-300 p-3 font-mono text-xs overflow-auto">{r.promptPreview}</pre>
              </div>

              {r.error ? (
                <div>
                  <div className="text-xs font-semibold opacity-70">Error</div>
                  <pre className="rounded-box bg-base-300 border border-base-300 p-3 font-mono text-xs overflow-auto">{r.error}</pre>
                </div>
              ) : null}

              {r.stdout ? (
                <div>
                  <div className="text-xs font-semibold opacity-70">stdout</div>
                  <pre className="rounded-box bg-base-300 border border-base-300 p-3 font-mono text-xs overflow-auto">{short(r.stdout, 8000)}</pre>
                </div>
              ) : null}

              {r.stderr ? (
                <div>
                  <div className="text-xs font-semibold opacity-70">stderr</div>
                  <pre className="rounded-box bg-base-300 border border-base-300 p-3 font-mono text-xs overflow-auto">{short(r.stderr, 8000)}</pre>
                </div>
              ) : null}

              <div>
                <div className="text-xs font-semibold opacity-70">Exit</div>
                <pre className="rounded-box bg-base-300 border border-base-300 p-3 font-mono text-xs overflow-auto">
                  {JSON.stringify(
                    { exitCode: r.exitCode ?? null, timedOut: r.timedOut ?? false, signal: r.signal ?? null },
                    null,
                    2,
                  )}
                </pre>
              </div>
            </div>
          </details>
        ))}
      </div>
    </div>
  )
}
