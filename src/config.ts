/**
 * 全專案的環境常數設定。
 * 未來要從環境變數 / 設定檔讀取就改這裡，其他模組不用動。
 */
import { homedir } from 'os'
import { join } from 'path'

export const CLAUDE_BIN = 'claude'
export const SOCKET_PATH = join(homedir(), '.rai', 'bot2.sock')
export const TMUX_SESSION = 'claude-reach'
