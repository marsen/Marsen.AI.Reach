/**
 * daemon ↔ client 共用的契約常數（兩端必須一致才能連上同一個 session / socket）。
 * CLI 專屬設定（如 CLAUDE_BIN）放各自的 adapter，不集中在此。
 */
import { homedir } from 'os'
import { join } from 'path'

export const SOCKET_PATH = join(homedir(), '.rai', 'bot.sock')
export const TMUX_SESSION = 'claude-reach'
