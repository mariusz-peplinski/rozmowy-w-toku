import fs from 'node:fs/promises'
import path from 'node:path'

export async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true })
}

export async function readJsonFile<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, 'utf8')
  return JSON.parse(raw) as T
}

export async function writeJsonFileAtomic(filePath: string, data: unknown): Promise<void> {
  const dir = path.dirname(filePath)
  const tmp = path.join(dir, `.${path.basename(filePath)}.tmp-${process.pid}-${Date.now()}`)
  const raw = JSON.stringify(data, null, 2) + '\n'
  await fs.writeFile(tmp, raw, 'utf8')
  await fs.rename(tmp, filePath)
}

export async function appendJsonlLine(filePath: string, line: unknown): Promise<void> {
  const raw = JSON.stringify(line) + '\n'
  await fs.appendFile(filePath, raw, 'utf8')
}

export async function readJsonlFile<T>(filePath: string): Promise<T[]> {
  const raw = await fs.readFile(filePath, 'utf8')
  const lines = raw.split('\n').filter(Boolean)
  const items: T[] = []
  for (const line of lines) {
    items.push(JSON.parse(line) as T)
  }
  return items
}

