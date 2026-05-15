import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Watcher } from './Watcher.js'

describe('Watcher', () => {
  let getPane: ReturnType<typeof vi.fn>
  let isProcessing: ReturnType<typeof vi.fn>
  let sessionExists: ReturnType<typeof vi.fn>
  let watcher: Watcher

  beforeEach(() => {
    vi.useFakeTimers()
    getPane = vi.fn().mockReturnValue('')
    isProcessing = vi.fn().mockReturnValue(false)
    sessionExists = vi.fn().mockReturnValue(true)
    watcher = new Watcher({ getPane, isProcessing, sessionExists })
  })

  afterEach(() => {
    watcher.stop()
    vi.useRealTimers()
  })

  const PANE_WITH_RESPONSE = `❯ hello\nsome claude response\n❯ \n─────\n`

  describe('觸發條件', () => {
    it('pane 有新內容且有 prompt → 呼叫 onNewContent', () => {
      getPane.mockReturnValue(PANE_WITH_RESPONSE)
      const onNewContent = vi.fn()
      watcher.start(onNewContent)
      vi.advanceTimersByTime(3000)
      expect(onNewContent).toHaveBeenCalledOnce()
    })

    it('isProcessing = true → 跳過', () => {
      getPane.mockReturnValue(PANE_WITH_RESPONSE)
      isProcessing.mockReturnValue(true)
      const onNewContent = vi.fn()
      watcher.start(onNewContent)
      vi.advanceTimersByTime(3000)
      expect(onNewContent).not.toHaveBeenCalled()
    })

    it('sessionExists = false → 跳過', () => {
      getPane.mockReturnValue(PANE_WITH_RESPONSE)
      sessionExists.mockReturnValue(false)
      const onNewContent = vi.fn()
      watcher.start(onNewContent)
      vi.advanceTimersByTime(3000)
      expect(onNewContent).not.toHaveBeenCalled()
    })

    it('pane 沒有變化 → 跳過', () => {
      getPane.mockReturnValue(PANE_WITH_RESPONSE)
      const onNewContent = vi.fn()
      watcher.start(onNewContent)
      vi.advanceTimersByTime(3000)
      vi.advanceTimersByTime(3000)
      expect(onNewContent).toHaveBeenCalledOnce()
    })

    it('有新內容但沒有 prompt → 跳過', () => {
      getPane.mockReturnValue('❯ hello\nsome response without prompt marker')
      const onNewContent = vi.fn()
      watcher.start(onNewContent)
      vi.advanceTimersByTime(3000)
      expect(onNewContent).not.toHaveBeenCalled()
    })
  })

  describe('去重', () => {
    it('新回應 → 呼叫 onNewContent', () => {
      getPane.mockReturnValue(PANE_WITH_RESPONSE)
      const onNewContent = vi.fn()
      watcher.start(onNewContent)
      vi.advanceTimersByTime(3000)
      expect(onNewContent).toHaveBeenCalledOnce()
    })

    it('相同回應 → 不重複呼叫', () => {
      const onNewContent = vi.fn()
      watcher.start(onNewContent)
      getPane.mockReturnValue(PANE_WITH_RESPONSE)
      vi.advanceTimersByTime(3000)
      getPane.mockReturnValue(PANE_WITH_RESPONSE + ' ')
      vi.advanceTimersByTime(3000)
      expect(onNewContent).toHaveBeenCalledOnce()
    })

    it('setLastNotified 後 watcher 跳過相同內容（runClaude 防重推）', () => {
      getPane.mockReturnValue(PANE_WITH_RESPONSE)
      const onNewContent = vi.fn()
      watcher.start(onNewContent)
      watcher.setLastNotified('some claude response')
      vi.advanceTimersByTime(3000)
      expect(onNewContent).not.toHaveBeenCalled()
    })
  })

  describe('stop()', () => {
    it('stop 後不再觸發', () => {
      getPane.mockReturnValue(PANE_WITH_RESPONSE)
      const onNewContent = vi.fn()
      watcher.start(onNewContent)
      watcher.stop()
      vi.advanceTimersByTime(3000)
      expect(onNewContent).not.toHaveBeenCalled()
    })
  })
})
