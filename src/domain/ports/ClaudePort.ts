export interface ClaudePort {
  run(message: string, onProgress?: (elapsed: number) => void): Promise<string>
  ensure(workDir: string): Promise<'new' | 'resumed'>
  isRunning(): boolean
}
