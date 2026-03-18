import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync, existsSync, utimesSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { SessionLogger } from './SessionLogger.js'

const baseDir = join(tmpdir(), `rai-test-${process.pid}`)
const workDir = '/some/project/MyApp'
const logDir = join(baseDir, 'logs', 'MyApp')

describe('SessionLogger', () => {
  beforeEach(() => {
    mkdirSync(baseDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(baseDir, { recursive: true, force: true })
  })

  it('建構時應建立 log 檔', () => {
    new SessionLogger(workDir, baseDir)

    const files = readdirSync(logDir)
    expect(files.length).toBe(1)
    expect(files[0]).toMatch(/^\d{8}-\d{6}\.log$/)
  })

  it('write() 應寫入 User 訊息', () => {
    const logger = new SessionLogger(workDir, baseDir)
    logger.write('User', '你好')

    const files = readdirSync(logDir)
    const content = readFileSync(join(logDir, files[0]), 'utf-8')
    expect(content).toContain('User: 你好')
  })

  it('write() 應寫入 Claude 訊息', () => {
    const logger = new SessionLogger(workDir, baseDir)
    logger.write('Claude', '我是 Claude')

    const files = readdirSync(logDir)
    const content = readFileSync(join(logDir, files[0]), 'utf-8')
    expect(content).toContain('Claude: 我是 Claude')
  })

  it('cleanup() 應刪除超過 30 天的 log', () => {
    mkdirSync(logDir, { recursive: true })
    const oldFile = join(logDir, '20250101-000000.log')
    writeFileSync(oldFile, 'old')
    const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000)
    utimesSync(oldFile, old, old)

    SessionLogger.cleanup(workDir, 30, baseDir)

    expect(existsSync(oldFile)).toBe(false)
  })

  it('cleanup() 應保留 30 天內的 log', () => {
    mkdirSync(logDir, { recursive: true })
    const newFile = join(logDir, '20260316-000000.log')
    writeFileSync(newFile, 'new')

    SessionLogger.cleanup(workDir, 30, baseDir)

    expect(existsSync(newFile)).toBe(true)
  })

  it('cleanup() 目錄不存在時不應拋錯', () => {
    expect(() => SessionLogger.cleanup('/nonexistent/path', 30, baseDir)).not.toThrow()
  })
})
