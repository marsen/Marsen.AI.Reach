export const PROMPT_RE = /❯[^\n]*\r?\n[-─]+/
// 比對使用者已送出的訊息（不是底部空白輸入框）：❯ 後接空格再接非空白字
const USER_INPUT_RE = /❯ [^\s].*/g
// Claude 「思考中 / 已思考多少秒」的狀態列噪音
const COOK_TIMER_RE = /^\s*✻ .+$/gm

export function cleanAnsi(s: string): string {
  return s.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')
}

export function hasPrompt(output: string): boolean {
  return PROMPT_RE.test(output)
}

export function extractResponse(pane: string): string {
  const clean = cleanAnsi(pane)
  const LAST_MSG_RE = /❯ .+/g
  let lastMatch: RegExpExecArray | null = null
  let m: RegExpExecArray | null
  while ((m = LAST_MSG_RE.exec(clean)) !== null) lastMatch = m
  if (!lastMatch) return clean.trim()
  const afterMsg = clean.slice(lastMatch.index + lastMatch[0].length)
  const promptIdx = afterMsg.search(PROMPT_RE)
  const raw = (promptIdx !== -1 ? afterMsg.slice(0, promptIdx) : afterMsg).trim()
  return raw.replace(/[-─]{3,}\s*$/, '').trim()
}

/**
 * 抽取「最後一輪對話」：使用者送出的訊息 + Claude 的回覆，去除 banner、cook timer、輸入框邊線。
 * 找不到回合（pane 還沒任何使用者訊息）→ 回空字串。
 */
export function extractLastExchange(pane: string): string {
  const clean = cleanAnsi(pane)

  // 找最後一個使用者已送出的訊息
  let lastMatch: RegExpExecArray | null = null
  let m: RegExpExecArray | null
  USER_INPUT_RE.lastIndex = 0
  while ((m = USER_INPUT_RE.exec(clean)) !== null) lastMatch = m
  if (!lastMatch) return ''

  // 從這則訊息開始，到下一個輸入框（PROMPT_RE）之前
  const fromExchange = clean.slice(lastMatch.index)
  const afterUserInput = fromExchange.slice(lastMatch[0].length)
  const promptIdx = afterUserInput.search(PROMPT_RE)
  const exchange = promptIdx === -1
    ? fromExchange
    : fromExchange.slice(0, lastMatch[0].length + promptIdx)

  // 去 cook timer、收斂多餘空行
  return exchange.replace(COOK_TIMER_RE, '').replace(/\n{3,}/g, '\n\n').trim()
}
