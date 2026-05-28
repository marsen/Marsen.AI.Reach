import { describe, it, expect } from 'vitest'
import { resolveLevel, isLevel, LEVELS } from './logLevel'

describe('resolveLevel', () => {
  it('合法值原樣回傳', () => {
    for (const level of LEVELS) expect(resolveLevel(level)).toBe(level)
  })

  it('未設（undefined）拋錯', () => {
    expect(() => resolveLevel(undefined)).toThrow(/not set/)
  })

  it('空字串拋錯', () => {
    expect(() => resolveLevel('')).toThrow(/not set/)
  })

  it('非法值拋錯，訊息含可用清單', () => {
    expect(() => resolveLevel('DEBGU')).toThrow(/無效/)
    expect(() => resolveLevel('debug')).toThrow(/無效/) // 大小寫敏感
  })
})

describe('isLevel', () => {
  it('合法值為 true、其他為 false', () => {
    expect(isLevel('WARN')).toBe(true)
    expect(isLevel('warn')).toBe(false)
    expect(isLevel('TRACE')).toBe(false)
  })
})

describe('LEVELS 順序', () => {
  it('由低到高為 DEBUG < INFO < WARN < ERROR', () => {
    expect([...LEVELS]).toEqual(['DEBUG', 'INFO', 'WARN', 'ERROR'])
  })
})
