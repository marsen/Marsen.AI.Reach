export interface WatcherPort {
  start(onNewContent: (content: string) => void): void
  stop(): void
  setLastNotified(response: string): void
}
