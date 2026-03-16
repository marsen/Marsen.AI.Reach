export interface ClaudePort {
  run(message: string): Promise<string>
  ensure(): Promise<'new' | 'resumed'>  // 確保 session 存在，回傳是新建或接續
  reset(): Promise<void>   // 強制 kill 重建（用於未來 /new 指令）
}
