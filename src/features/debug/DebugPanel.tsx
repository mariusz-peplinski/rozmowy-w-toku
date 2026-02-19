import { useCallback, useEffect, useState } from 'react'
import type { ChatId, DebugRunLog } from '../../../shared/types'

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

  return (
    <div className="debugPanel">
      <div className="debugPanelHeader">
        <div className="debugPanelTitle">Debug</div>
        <div className="debugPanelActions">
          <button className="btn" onClick={() => refresh()} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <button className="btn btnDanger" onClick={() => clear()} disabled={loading}>
            Clear
          </button>
        </div>
      </div>

      {error ? <div className="dangerBox">{error}</div> : null}
      {runs.length === 0 ? (
        <div style={{ color: 'var(--muted)', fontSize: 12 }}>
          No runs yet. Click an agent to see the executed command, prompt, and output here.
        </div>
      ) : null}

      <div className="debugRuns">
        {runs.map((r) => (
          <details key={r.id} className="debugRun" open={r.status === 'running'}>
            <summary className="debugRunSummary">
              <span className={`debugBadge debugBadge_${r.status}`}>{statusLabel(r)}</span>
              <span style={{ fontFamily: 'var(--mono)' }}>{r.provider}</span>
              <span>{r.participantDisplayName}</span>
              <span style={{ color: 'var(--muted)', fontSize: 12 }}>
                {new Date(r.tsStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
              <span style={{ color: 'var(--muted)', fontSize: 12 }}>
                {r.trigger === 'mention' ? `mention s${r.tagSessionIndex ?? '?'}` : 'manual'}
              </span>
            </summary>

            <div className="debugBlock">
              <div className="debugLabel">Command</div>
              <pre className="debugPre">{[r.command, ...r.args].join(' ')}</pre>
              <div className="debugLabel">cwd</div>
              <pre className="debugPre">{r.cwd}</pre>
              <div className="debugLabel">Prompt (preview)</div>
              <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 6 }}>
                {r.promptLength.toLocaleString()} chars
              </div>
              <pre className="debugPre">{r.promptPreview}</pre>

              {r.error ? (
                <>
                  <div className="debugLabel">Error</div>
                  <pre className="debugPre">{r.error}</pre>
                </>
              ) : null}

              {r.stdout ? (
                <>
                  <div className="debugLabel">stdout</div>
                  <pre className="debugPre">{short(r.stdout, 8000)}</pre>
                </>
              ) : null}

              {r.stderr ? (
                <>
                  <div className="debugLabel">stderr</div>
                  <pre className="debugPre">{short(r.stderr, 8000)}</pre>
                </>
              ) : null}

              <div className="debugLabel">Exit</div>
              <pre className="debugPre">
                {JSON.stringify(
                  { exitCode: r.exitCode ?? null, timedOut: r.timedOut ?? false, signal: r.signal ?? null },
                  null,
                  2,
                )}
              </pre>
            </div>
          </details>
        ))}
      </div>
    </div>
  )
}
