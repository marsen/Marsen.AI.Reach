export interface ClaudePort {
  run(message: string, onProgress?: (elapsed: number) => void): Promise<string>
  ensure(workDir: string): Promise<'new' | 'resumed'>  // 確保 session 存在，回傳是新建或接續
  reset(workDir: string): Promise<void>   // 強制 kill 重建（用於未來 /new 指令）
  isRunning(): boolean  // 確認 tmux session 與 claude process 確實存在
  startWatcher(onNewContent: (content: string) => void): void  // 監聽背景任務完成通知
  stopWatcher(): void
}
