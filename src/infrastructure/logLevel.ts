/**
 * Log 級別的純邏輯：型別、驗證、env 解析。
 *
 * 抽離 FileLogger 的副作用（寫檔 / console）獨立成零依賴模組，
 * 讓 resolveLevel 可單元測試，不必在測試中觸發 FileLogger 頂層的 env 解析。
 */

// 唯一真實來源：一份陣列同時表達「型別」「合法值」「優先級順序」（index 即級別高低）
export const LEVELS = ['DEBUG', 'INFO', 'WARN', 'ERROR'] as const
export type Level = typeof LEVELS[number]

export const isLevel = (s: string): s is Level => (LEVELS as readonly string[]).includes(s)

/**
 * 解析 LOG_LEVEL env。必填，無預設——未設或非法一律 throw（fail-loud）。
 * 預設值由 .env.example 的 `LOG_LEVEL=INFO` 顯式提供，不藏在程式碼裡。
 */
export function resolveLevel(raw: string | undefined): Level {
  if (!raw) throw new Error('LOG_LEVEL not set')
  if (!isLevel(raw)) throw new Error(`LOG_LEVEL='${raw}' 無效，可用：${LEVELS.join(', ')}`)
  return raw
}
