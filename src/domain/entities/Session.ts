export class Session {
  private active = false

  start(): void {
    this.active = true
  }

  stop(): void {
    this.active = false
  }

  isActive(): boolean {
    return this.active
  }
}
