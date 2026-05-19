import { describe, it, expect } from 'vitest'
import { extractLastExchange } from './claudeParser.js'

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
  })

  it('pane 還沒任何使用者訊息 → 回空字串', () => {
    const pane = ' ▐▛███▜▌  Claude Code\n\n❯ \n────'
    expect(extractLastExchange(pane)).toBe('')
  })
})
