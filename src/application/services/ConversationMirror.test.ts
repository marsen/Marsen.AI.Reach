import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConversationMirror } from './ConversationMirror'
import type { ChatPort, CLIPaneIO, PaneExchange, LogPort } from '@ports'

// 以下測試用 Claude CLI 的輸出當具體例子（`❯` 開頭的 user 行、回覆格式），純粹為了好讀。
// ConversationMirror 本身不綁定 Claude——它只經 CLIPaneIO 收 PaneExchange，
// 換成 gemini / codex 等任何 CLI，adapter 產生相同結構即適用。這裡驗證的是
// chat ↔ CLI 的通用 relay 行為，不是 Claude 專屬邏輯。

const mockBot = (): ChatPort => ({
  send: vi.fn().mockResolvedValue(undefined),
  onMessage: vi.fn(),
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(undefined),
})

const mockCLIPaneIO = (): CLIPaneIO => ({
  send: vi.fn().mockResolvedValue(undefined),
  onMessage: vi.fn(),
})

const mockLog = (): LogPort => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })

// 建一筆 CLI emit；raw 預設組成「❯ user + 回覆」，需要時可覆寫
const exchange = (user: string, response: string, raw = `❯ ${user}\n\n${response}`): PaneExchange =>
  ({ user, response, raw })

// 取得最近一次傳給 mock 函式的第一個參數（通常是 callback）
const lastHandler = <T extends (...args: never[]) => unknown>(fn: T): Parameters<T>[0] =>
  vi.mocked(fn).mock.calls.at(-1)![0]

describe('ConversationMirror', () => {
  let bot: ChatPort
  let cliIO: CLIPaneIO
  let log: LogPort

  beforeEach(() => {
    bot = mockBot()
    cliIO = mockCLIPaneIO()
    log = mockLog()
  })

  it('start() 註冊 handlers 並啟動 bot', async () => {
    const mirror = new ConversationMirror(bot, cliIO, log)

    await mirror.start()

    expect(bot.onMessage).toHaveBeenCalledTimes(1)
    expect(cliIO.onMessage).toHaveBeenCalledTimes(1)
    expect(bot.start).toHaveBeenCalledTimes(1)
  })

  it('chat 訊息 → 呼叫 cliIO.send', async () => {
    const mirror = new ConversationMirror(bot, cliIO, log)
    await mirror.start()

    const fromBot = lastHandler(bot.onMessage)
    fromBot('hello from chat')

    expect(cliIO.send).toHaveBeenCalledWith('hello from chat')
  })

  it('Claude 新輸出 → 呼叫 bot.send', async () => {
    const mirror = new ConversationMirror(bot, cliIO, log)
    await mirror.start()

    const fromCli = lastHandler(cliIO.onMessage)
    fromCli(exchange('', 'Claude says hi', 'Claude says hi'))

    // 等 microtask 跑完 fire-and-forget 的 push
    await Promise.resolve()
    await Promise.resolve()

    expect(bot.send).toHaveBeenCalledWith('Claude says hi')
  })

  it('Claude 輸出超大字串 → 整段交給 bot.send（分段由 adapter 處理）', async () => {
    const mirror = new ConversationMirror(bot, cliIO, log)
    await mirror.start()

    const text5000 = 'a'.repeat(5000)
    const fromCli = lastHandler(cliIO.onMessage)
    fromCli(exchange('', text5000, text5000))

    await new Promise((r) => setImmediate(r))

    expect(bot.send).toHaveBeenCalledTimes(1)
    expect(vi.mocked(bot.send).mock.calls[0][0]).toBe(text5000)
  })

  it('chat 來源的問題 → Claude emit exchange 時只 push response', async () => {
    const mirror = new ConversationMirror(bot, cliIO, log)
    await mirror.start()

    // chat 送進來 "123"
    const fromBot = lastHandler(bot.onMessage)
    fromBot('123')

    // Claude pane 抓到 exchange（user 命中剛送出的 chat input）
    const fromCli = lastHandler(cliIO.onMessage)
    fromCli(exchange('123', '收到，請問需要做什麼？'))

    await new Promise((r) => setImmediate(r))

    expect(bot.send).toHaveBeenCalledTimes(1)
    expect(vi.mocked(bot.send).mock.calls[0][0]).toBe('收到，請問需要做什麼？')
  })

  it('host 來源的問題（沒走過 chat）→ push 原始整段（raw）', async () => {
    const mirror = new ConversationMirror(bot, cliIO, log)
    await mirror.start()

    // 沒有 chat onMessage，直接 Claude 端冒出 exchange
    const fromCli = lastHandler(cliIO.onMessage)
    fromCli(exchange('123', '收到，請問需要做什麼？'))

    await new Promise((r) => setImmediate(r))

    expect(bot.send).toHaveBeenCalledTimes(1)
    expect(vi.mocked(bot.send).mock.calls[0][0]).toBe('❯ 123\n\n收到，請問需要做什麼？')
  })

  it('chat 來源處理完 → 下一輪（host 來源）回到整段模式', async () => {
    const mirror = new ConversationMirror(bot, cliIO, log)
    await mirror.start()

    const fromBot = lastHandler(bot.onMessage)
    const fromCli = lastHandler(cliIO.onMessage)

    fromBot('123')
    fromCli(exchange('123', '回應 A'))
    await new Promise((r) => setImmediate(r))

    // 下一輪沒走 chat（host 端打字）
    fromCli(exchange('456', '回應 B'))
    await new Promise((r) => setImmediate(r))

    expect(bot.send).toHaveBeenCalledTimes(2)
    expect(vi.mocked(bot.send).mock.calls[0][0]).toBe('回應 A')
    expect(vi.mocked(bot.send).mock.calls[1][0]).toBe('❯ 456\n\n回應 B')
  })

  it('stop() 關掉 bot', async () => {
    const mirror = new ConversationMirror(bot, cliIO, log)
    await mirror.start()

    await mirror.stop()

    expect(bot.stop).toHaveBeenCalledTimes(1)
  })
})
