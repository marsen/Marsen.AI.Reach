import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConversationMirror } from './ConversationMirror.js'
import type { BotPort } from '../ports/BotPort.js'
import type { CLIPaneIO } from '../ports/CLIPaneIO.js'

const mockBot = (): BotPort => ({
  push: vi.fn().mockResolvedValue(undefined),
  onMessage: vi.fn(),
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(undefined),
})

const mockClaudeIO = (): CLIPaneIO => ({
  send: vi.fn().mockResolvedValue(undefined),
  onMessage: vi.fn(),
})

// 取得最近一次傳給 mock 函式的第一個參數（通常是 callback）
const lastHandler = <T extends (...args: never[]) => unknown>(fn: T): Parameters<T>[0] =>
  vi.mocked(fn).mock.calls.at(-1)![0]

describe('ConversationMirror', () => {
  let bot: BotPort
  let claudeIO: CLIPaneIO

  beforeEach(() => {
    bot = mockBot()
    claudeIO = mockClaudeIO()
  })

  it('start() 註冊 handlers 並啟動 bot', async () => {
    const mirror = new ConversationMirror(bot, claudeIO)

    await mirror.start()

    expect(bot.onMessage).toHaveBeenCalledTimes(1)
    expect(claudeIO.onMessage).toHaveBeenCalledTimes(1)
    expect(bot.start).toHaveBeenCalledTimes(1)
  })

  it('TC 訊息 → 呼叫 claudeIO.send', async () => {
    const mirror = new ConversationMirror(bot, claudeIO)
    await mirror.start()

    const fromBot = lastHandler(bot.onMessage)
    fromBot('hello from TC')

    expect(claudeIO.send).toHaveBeenCalledWith('hello from TC')
  })

  it('Claude 新輸出 → 呼叫 bot.push', async () => {
    const mirror = new ConversationMirror(bot, claudeIO)
    await mirror.start()

    const fromClaude = lastHandler(claudeIO.onMessage)
    fromClaude('Claude says hi')

    // 等 microtask 跑完 fire-and-forget 的 push
    await Promise.resolve()
    await Promise.resolve()

    expect(bot.push).toHaveBeenCalledWith('Claude says hi')
  })

  it('Claude 輸出超過 4096 字元 → 分段 push', async () => {
    const mirror = new ConversationMirror(bot, claudeIO)
    await mirror.start()

    const text5000 = 'a'.repeat(5000)
    const fromClaude = lastHandler(claudeIO.onMessage)
    fromClaude(text5000)

    // 等所有 push 完成
    await new Promise((r) => setImmediate(r))

    expect(bot.push).toHaveBeenCalledTimes(2)
    expect(vi.mocked(bot.push).mock.calls[0][0]).toHaveLength(4096)
    expect(vi.mocked(bot.push).mock.calls[1][0]).toHaveLength(5000 - 4096)
  })

  it('TC 來源的問題 → Claude emit exchange 時剝掉 user 行，只 push response', async () => {
    const mirror = new ConversationMirror(bot, claudeIO)
    await mirror.start()

    // TC 送進來 "123"
    const fromBot = lastHandler(bot.onMessage)
    fromBot('123')

    // Claude pane 抓到 exchange（含 user 行 + 回應）
    const fromClaude = lastHandler(claudeIO.onMessage)
    fromClaude('❯ 123\n\n收到，請問需要做什麼？')

    await new Promise((r) => setImmediate(r))

    expect(bot.push).toHaveBeenCalledTimes(1)
    expect(vi.mocked(bot.push).mock.calls[0][0]).toBe('收到，請問需要做什麼？')
  })

  it('PC 來源的問題（沒走過 TC）→ push 整段含 user 行', async () => {
    const mirror = new ConversationMirror(bot, claudeIO)
    await mirror.start()

    // 沒有 TC onMessage，直接 Claude 端冒出 exchange
    const fromClaude = lastHandler(claudeIO.onMessage)
    fromClaude('❯ 123\n\n收到，請問需要做什麼？')

    await new Promise((r) => setImmediate(r))

    expect(bot.push).toHaveBeenCalledTimes(1)
    expect(vi.mocked(bot.push).mock.calls[0][0]).toBe('❯ 123\n\n收到，請問需要做什麼？')
  })

  it('TC 來源剝完 → 下一輪（PC 來源）回到整段模式', async () => {
    const mirror = new ConversationMirror(bot, claudeIO)
    await mirror.start()

    const fromBot = lastHandler(bot.onMessage)
    const fromClaude = lastHandler(claudeIO.onMessage)

    fromBot('123')
    fromClaude('❯ 123\n\n回應 A')
    await new Promise((r) => setImmediate(r))

    // 下一輪沒走 TC（PC 端打字）
    fromClaude('❯ 456\n\n回應 B')
    await new Promise((r) => setImmediate(r))

    expect(bot.push).toHaveBeenCalledTimes(2)
    expect(vi.mocked(bot.push).mock.calls[0][0]).toBe('回應 A')
    expect(vi.mocked(bot.push).mock.calls[1][0]).toBe('❯ 456\n\n回應 B')
  })

  it('stop() 關掉 bot', async () => {
    const mirror = new ConversationMirror(bot, claudeIO)
    await mirror.start()

    await mirror.stop()

    expect(bot.stop).toHaveBeenCalledTimes(1)
  })
})
