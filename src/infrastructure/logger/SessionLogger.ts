import { appendFileSync, mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'fs'
import { join, basename } from 'path'
import { homedir } from 'os'

export class SessionLogger {
  private logPath: string

  constructor(workDir: string, baseDir = join(homedir(), '.rai')) {
    const projectName = basename(workDir)
    const logDir = join(baseDir, 'logs', projectName)
    mkdirSync(logDir, { recursive: true })

    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const filename = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.log`
    this.logPath = join(logDir, filename)
    writeFileSync(this.logPath, '', { flag: 'a' })
  }

  write(role: 'User' | 'Claude', message: string): void {
    const ts = new Date().toISOString().replace('T', ' ').slice(0, 19)
    appendFileSync(this.logPath, `[${ts}] ${role}: ${message}\n\n`)
  }

  static cleanup(workDir: string, days = 30, baseDir = join(homedir(), '.rai')): number {
    const projectName = basename(workDir)
    const logDir = join(baseDir, 'logs', projectName)
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
    let count = 0
    try {
      for (const file of readdirSync(logDir)) {
        if (!file.endsWith('.log')) continue
        const filePath = join(logDir, file)
        if (statSync(filePath).mtimeMs < cutoff) {
          unlinkSync(filePath)
          count++
        }
      }
    } catch {
      // logDir 不存在就跳過
    }
    return count
  }
}
