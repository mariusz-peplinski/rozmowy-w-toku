import { runProcess } from './runProcess'
import type { AgentType, RoamingConfig } from '../../../shared/types'
import { ensureDir } from '../util/fsUtil'

export type ProviderRun = {
  type: AgentType
  prompt: string
  roaming: RoamingConfig
  /**
   * Used when roaming is disabled (keeps providers away from random FS locations).
   */
  defaultWorkDir: string
  /**
   * Used when roaming is enabled and workspaceDir is set.
   */
  roamingWorkDir?: string
  timeoutMs?: number
}

function normalizeOutput(text: string): string {
  return text.replace(/\r\n/g, '\n').trim()
}

function isEnoent(err: unknown): err is NodeJS.ErrnoException {
  return typeof err === 'object' && err !== null && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT'
}

export type ProviderStartInfo = {
  type: AgentType
  command: string
  args: string[]
  cwd: string
  timeoutMs: number
  env?: Record<string, string | undefined>
}

export type ProviderExecInfo = ProviderStartInfo & {
  stdout: string
  stderr: string
  exitCode: number | null
  signal: NodeJS.Signals | null
  timedOut: boolean
}

export async function runProviderDetailed(input: ProviderRun & { onStart?: (info: ProviderStartInfo) => void }): Promise<{
  text: string
  exec: ProviderExecInfo
}> {
  const timeoutMs = input.timeoutMs ?? (input.roaming.enabled ? 240_000 : 90_000)
  const cwd = input.roaming.enabled && input.roamingWorkDir ? input.roamingWorkDir : input.defaultWorkDir

  if (input.type === 'codex') {
    // No special setup here; we always pass --skip-git-repo-check to keep the app self-contained.
    await ensureDir(cwd)
  } else {
    await ensureDir(cwd)
  }

  const { command, args, env } = await buildCommand({
    type: input.type,
    prompt: input.prompt,
    roaming: input.roaming,
    cwd,
  })

  try {
    const startInfo: ProviderStartInfo = { type: input.type, command, args, cwd, timeoutMs, env }
    input.onStart?.(startInfo)

    const res = await runProcess({ command, args, cwd, env, timeoutMs })
    const exec: ProviderExecInfo = { ...startInfo, ...res }
    const out = normalizeOutput(res.stdout || res.stderr)
    return { text: out, exec }
  } catch (e) {
    if (isEnoent(e)) {
      throw new Error(`Command not found: ${command}. Is the ${input.type} CLI installed and on PATH?`)
    }
    throw e
  }
}

export async function runProvider(input: ProviderRun): Promise<string> {
  const { text } = await runProviderDetailed(input)
  return text
}

async function buildCommand(opts: {
  type: AgentType
  prompt: string
  roaming: RoamingConfig
  cwd: string
}): Promise<{ command: string; args: string[]; env?: Record<string, string | undefined> }> {
  const { type, prompt, roaming } = opts

  if (type === 'codex') {
    // Docs: https://developers.openai.com/codex/cli
    const args: string[] = ['exec', '--ephemeral', '--skip-git-repo-check']
    if (roaming.enabled) {
      args.push('--full-auto')
      args.push('--sandbox', roaming.mode === 'yolo' ? 'danger-full-access' : 'workspace-write')
    }
    args.push(prompt)
    return { command: 'codex', args }
  }

  if (type === 'claude') {
    // Docs: https://docs.anthropic.com/en/docs/claude-code/cli-reference
    const args: string[] = ['-p', prompt, '--output-format', 'text']
    if (roaming.enabled) {
      args.push('--dangerously-skip-permissions')
      // Default toolset; keep small. Users can expand later via app settings.
      args.push('--allowedTools', 'Bash,Read,Write')
      if (roaming.workspaceDir) args.push('--cwd', roaming.workspaceDir)
    } else {
      // "plan" avoids tool usage and keeps runs deterministic.
      args.push('--permission-mode', 'plan')
    }
    return { command: 'claude', args }
  }

  // Gemini CLI docs: https://google-gemini.github.io/gemini-cli/docs/cli/commands/
  const args: string[] = ['-p', prompt, '--output-format', 'text']
  if (roaming.enabled) {
    args.push('--yolo')
  }
  return { command: 'gemini', args }
}
