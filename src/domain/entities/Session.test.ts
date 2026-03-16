import { describe, it, expect, beforeEach } from 'vitest'
import { Session } from './Session.js'

describe('Session', () => {
  let session: Session

  beforeEach(() => {
    session = new Session()
  })

  it('初始狀態應為 inactive', () => {
    expect(session.isActive()).toBe(false)
  })

  it('start() 後 isActive() 應為 true', () => {
    session.start()
    expect(session.isActive()).toBe(true)
  })

  it('start() 再 stop() 後 isActive() 應為 false', () => {
    session.start()
    session.stop()
    expect(session.isActive()).toBe(false)
  })

  it('未 start 直接 stop() 應保持 inactive', () => {
    session.stop()
    expect(session.isActive()).toBe(false)
  })

  it('stop() 後再 start() 應變 active', () => {
    session.start()
    session.stop()
    session.start()
    expect(session.isActive()).toBe(true)
  })
})
