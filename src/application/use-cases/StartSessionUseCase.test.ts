import { describe, it, expect, vi, beforeEach } from 'vitest'
import { StartSessionUseCase } from './StartSessionUseCase.js'
import { Session } from '../../domain/entities/Session.js'
import type { ClaudePort } from '../../domain/ports/ClaudePort.js'

const mockClaude = (): ClaudePort => ({
  ensure: vi.fn(),
  run: vi.fn(),
  reset: vi.fn(),
})

describe('StartSessionUseCase', () => {
  let session: Session
  let claude: ClaudePort

  beforeEach(() => {
    session = new Session()
    claude = mockClaude()
  })

  it('ensure() 回傳 new → execute() 應回傳 new 且 session 變 active', async () => {
    vi.mocked(claude.ensure).mockResolvedValue('new')
    const uc = new StartSessionUseCase(claude, session)

    const result = await uc.execute()

    expect(result).toBe('new')
    expect(session.isActive()).toBe(true)
  })

  it('ensure() 回傳 resumed → execute() 應回傳 resumed 且 session 變 active', async () => {
    vi.mocked(claude.ensure).mockResolvedValue('resumed')
    const uc = new StartSessionUseCase(claude, session)

    const result = await uc.execute()

    expect(result).toBe('resumed')
    expect(session.isActive()).toBe(true)
  })
})
