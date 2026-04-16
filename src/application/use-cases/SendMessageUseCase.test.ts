import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SendMessageUseCase } from './SendMessageUseCase.js'
import { Session } from '../../domain/entities/Session.js'
import type { ClaudePort } from '../../domain/ports/ClaudePort.js'

const mockClaude = (): ClaudePort => ({
  ensure: vi.fn(),
  run: vi.fn(),
  reset: vi.fn(),
  isRunning: vi.fn(),
  startWatcher: vi.fn(),
  stopWatcher: vi.fn(),
})

describe('SendMessageUseCase', () => {
  let session: Session
  let claude: ClaudePort

  beforeEach(() => {
    session = new Session()
    claude = mockClaude()
  })

  it('session inactive 時 execute() 應拋出錯誤', async () => {
    const uc = new SendMessageUseCase(claude, session)

    await expect(uc.execute('hello')).rejects.toThrow('Session 未啟動')
  })

  it('session active 時 execute() 應呼叫 claude.run() 並回傳結果', async () => {
    vi.mocked(claude.run).mockResolvedValue('Claude 的回應')
    session.start()
    const uc = new SendMessageUseCase(claude, session)

    const result = await uc.execute('hello')

    expect(claude.run).toHaveBeenCalledWith('hello', undefined)
    expect(result).toBe('Claude 的回應')
  })

  it('claude.run() 拋錯時應向上傳遞', async () => {
    vi.mocked(claude.run).mockRejectedValue(new Error('tmux 逾時'))
    session.start()
    const uc = new SendMessageUseCase(claude, session)

    await expect(uc.execute('hello')).rejects.toThrow('tmux 逾時')
  })
})
