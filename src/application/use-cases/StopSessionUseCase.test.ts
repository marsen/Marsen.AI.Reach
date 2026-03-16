import { describe, it, expect, beforeEach } from 'vitest'
import { StopSessionUseCase } from './StopSessionUseCase.js'
import { Session } from '../../domain/entities/Session.js'

describe('StopSessionUseCase', () => {
  let session: Session

  beforeEach(() => {
    session = new Session()
  })

  it('execute() 後 session 應變 inactive', () => {
    session.start()
    const uc = new StopSessionUseCase(session)

    uc.execute()

    expect(session.isActive()).toBe(false)
  })
})
