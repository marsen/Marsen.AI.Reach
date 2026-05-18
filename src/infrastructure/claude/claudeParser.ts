export const PROMPT_RE = /❯[^\n]*\r?\n[-─]+/

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
