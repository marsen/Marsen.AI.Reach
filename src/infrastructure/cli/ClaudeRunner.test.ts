import { describe, it, expect } from 'vitest'
import { extractLastExchange, splitExchange } from './ClaudeRunner'

describe('extractLastExchange', () => {
  it('抓最後一輪（user + Claude 回應），去除 cook timer 與輸入框', () => {
    const pane = [
      ' ▐▛███▜▌   Claude Code v2.1.144',
      ' ▝▜█████▛▘  Opus 4.7 · Claude Pro',
      '',
      '❯ 1+3?',
      '',
      '⏺ 4',
      '',
      '✻ Baked for 4s',
      '',
      '❯ 哪裡好笑？',
      '',
      '⏺ 因為八進位的 31 等於十進位的 25。',
      '',
      '  Oct = Octal；Dec = Decimal。',
      '',
      '✻ Crunched for 8s',
      '────',
      '❯ ',
      '────────',
    ].join('\n')

    const result = extractLastExchange(pane)

    expect(result).toContain('❯ 哪裡好笑？')
    expect(result).toContain('⏺ 因為八進位的 31 等於十進位的 25。')
    expect(result).toContain('Oct = Octal')
    expect(result).not.toContain('✻')      // cook timer 移掉
    expect(result).not.toContain('Claude Code v2.1.144')   // banner 不在
    expect(result).not.toContain('1+3?')   // 上一輪不在（只抓最後一輪）
    expect(result).not.toMatch(/^[─━－-]{3,}$/m)   // 整行橫線裝飾不在
  })

  it('pane 還沒任何使用者訊息 → 回空字串', () => {
    const pane = ' ▐▛███▜▌  Claude Code\n\n❯ \n────'
    expect(extractLastExchange(pane)).toBe('')
  })
})

describe('splitExchange', () => {
  it('首行 ❯ 為 user（去前綴），其餘為 response，raw 原樣保留', () => {
    const raw = '❯ 哪裡好笑？\n\n⏺ 因為八進位的 31 等於十進位的 25。'
    const ex = splitExchange(raw)

    expect(ex.user).toBe('哪裡好笑？')
    expect(ex.response).toBe('⏺ 因為八進位的 31 等於十進位的 25。')
    expect(ex.raw).toBe(raw)
  })

  it('多行 response 完整保留', () => {
    const raw = '❯ 解釋一下\n\n第一段\n\n第二段'
    const ex = splitExchange(raw)

    expect(ex.user).toBe('解釋一下')
    expect(ex.response).toBe('第一段\n\n第二段')
  })
})
