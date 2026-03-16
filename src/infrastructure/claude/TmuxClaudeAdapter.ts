import { execSync } from 'child_process'
import { writeFileSync } from 'fs'
import { ClaudePort } from '../../domain/ports/ClaudePort.js'
import { WORK_DIR, CLAUDE_BIN } from '../config/env.js'

const SESSION = 'claude-reach'
const PROMPT_RE = /❯\s*\r?\n[-─]+/
const STABLE_POLLS = 3   // 連續 N 次沒變化才算穩定
const POLL_INTERVAL = 800

function tmux(args: string): string {
  return execSync(`tmux ${args}`, { encoding: 'utf-8' })
}

function sessionExists(): boolean {
  try {
    tmux(`has-session -t ${SESSION}`)
    return true
  } catch {
    return false
  }
}

function isClaudeRunning(): boolean {
  try {
    execSync(`pgrep -f "${CLAUDE_BIN}"`, { encoding: 'utf-8' })
    return true
  } catch {
    return false
  }
}

async function createSession(): Promise<void> {
  console.log('[claude] starting new tmux session...')
  tmux(`new-session -d -s ${SESSION} -x 220 -y 50`)
  tmux(`send-keys -t ${SESSION} "cd ${WORK_DIR} && ${CLAUDE_BIN} --dangerously-skip-permissions" Enter`)
  await waitForStablePrompt(60000)
  console.log('[claude] session ready')
}

function capturePane(): string {
  return tmux(`capture-pane -t ${SESSION} -p -S -1000`)
}

function cleanAnsi(s: string): string {
  return s.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')
}

function hasPrompt(output: string): boolean {
  return PROMPT_RE.test(cleanAnsi(output))
}

// 等 pane 內容穩定（連續 N 次不變）且 prompt 出現
async function waitForStablePrompt(timeout = 120000): Promise<void> {
  const start = Date.now()
  let lastOutput = ''
  let stableCount = 0

  while (Date.now() - start < timeout) {
    const current = cleanAnsi(capturePane())

    if (current === lastOutput && hasPrompt(current)) {
      stableCount++
      if (stableCount >= STABLE_POLLS) return
    } else {
      stableCount = 0
    }

    lastOutput = current
    await new Promise((r) => setTimeout(r, POLL_INTERVAL))
  }

  throw new Error('等待 Claude 回應逾時')
}

async function ensureSession(): Promise<'new' | 'resumed'> {
  if (sessionExists() && isClaudeRunning()) return 'resumed'
  if (sessionExists()) tmux(`kill-session -t ${SESSION}`)
  await createSession()
  return 'new'
}

function extractResponse(pane: string): string {
  const clean = cleanAnsi(pane)

  // 找最後一個 ❯ <有內容>（最新的用戶訊息 echo）
  const LAST_MSG_RE = /❯ .+/g
  let lastMatch: RegExpExecArray | null = null
  let m: RegExpExecArray | null
  while ((m = LAST_MSG_RE.exec(clean)) !== null) lastMatch = m

  if (!lastMatch) return clean.trim()

  // 取 echo 之後到 prompt 之間的內容
  const afterMsg = clean.slice(lastMatch.index + lastMatch[0].length)
  const promptIdx = afterMsg.search(PROMPT_RE)
  const raw = (promptIdx !== -1 ? afterMsg.slice(0, promptIdx) : afterMsg).trim()
  // 移除尾巴的分隔線（─ 或 -）
  return raw.replace(/[-─]{3,}\s*$/, '').trim()
}

export class TmuxClaudeAdapter implements ClaudePort {
  async run(message: string): Promise<string> {
    return runClaude(message)
  }

  async ensure(): Promise<'new' | 'resumed'> {
    return ensureSession()
  }

  async reset(): Promise<void> {
    if (sessionExists()) tmux(`kill-session -t ${SESSION}`)
    await createSession()
  }
}

async function runClaude(message: string): Promise<string> {
  await ensureSession()

  // 用 tmux buffer 傳訊息，避免特殊字元問題
  const tmpFile = '/tmp/claude-reach-msg.txt'
  writeFileSync(tmpFile, message)
  tmux(`load-buffer ${tmpFile}`)
  tmux(`paste-buffer -t ${SESSION}`)
  tmux(`send-keys -t ${SESSION} Enter`)

  console.log('[claude] message sent, waiting for stable response...')

  await waitForStablePrompt(120000)

  const pane = capturePane()
  const response = extractResponse(pane)
  console.log('[claude] response length:', response.length, 'preview:', response.slice(0, 80))
  return response
}
