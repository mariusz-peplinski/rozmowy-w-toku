import { spawn } from 'node:child_process'

export type RunProcessResult = {
  stdout: string
  stderr: string
  exitCode: number | null
  signal: NodeJS.Signals | null
  timedOut: boolean
}

export async function runProcess(opts: {
  command: string
  args: string[]
  cwd: string
  env?: Record<string, string | undefined>
  timeoutMs: number
  stdin?: string
}): Promise<RunProcessResult> {
  const { command, args, cwd, env, timeoutMs, stdin } = opts

  return new Promise<RunProcessResult>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...(env ?? {}) },
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
    })

    let stdout = ''
    let stderr = ''
    let timedOut = false

    const timer = setTimeout(() => {
      timedOut = true
      // Best-effort shutdown. In v1 we keep it simple and avoid platform-specific process-tree killing.
      child.kill('SIGTERM')
      setTimeout(() => child.kill('SIGKILL'), 1500).unref()
    }, timeoutMs)

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')

    child.stdout.on('data', (chunk: string) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk
    })

    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })

    child.on('close', (exitCode, signal) => {
      clearTimeout(timer)
      resolve({ stdout, stderr, exitCode, signal, timedOut })
    })

    if (stdin) child.stdin.write(stdin)
    child.stdin.end()
  })
}

