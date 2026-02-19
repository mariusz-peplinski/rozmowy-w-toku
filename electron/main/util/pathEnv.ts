import path from 'node:path'
import { spawn } from 'node:child_process'

function splitPathEntries(value: string | undefined): string[] {
  if (!value) return []
  return value.split(path.delimiter).map((p) => p.trim()).filter(Boolean)
}

function uniq(entries: string[]): string[] {
  return [...new Set(entries)]
}

function platformFallbackPaths(): string[] {
  if (process.platform === 'darwin') {
    return ['/opt/homebrew/bin', '/usr/local/bin', '/opt/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin']
  }
  if (process.platform === 'linux') {
    return ['/usr/local/sbin', '/usr/local/bin', '/usr/sbin', '/usr/bin', '/sbin', '/bin']
  }
  return []
}

async function getLoginShellPath(): Promise<string | undefined> {
  if (process.platform === 'win32') return undefined

  const shell = process.env.SHELL || '/bin/zsh'
  return new Promise((resolve) => {
    const child = spawn(shell, ['-ilc', 'printf "%s" "$PATH"'], {
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 4000,
    })
    let out = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      out += chunk
    })
    child.on('error', () => resolve(undefined))
    child.on('close', () => {
      const value = out.trim()
      resolve(value || undefined)
    })
  })
}

export async function initializeProcessPath(): Promise<void> {
  const home = process.env.HOME
  const fromEnv = splitPathEntries(process.env.PATH)
  const fromShell = splitPathEntries(await getLoginShellPath())
  const fromFallback = platformFallbackPaths()
  const fromHome = home ? [`${home}/.local/bin`, `${home}/bin`] : []

  process.env.PATH = uniq([...fromEnv, ...fromShell, ...fromFallback, ...fromHome]).join(path.delimiter)
}

