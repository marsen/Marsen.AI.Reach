/**
 * bot2.ts — 程式進入點（主服務）
 * 只聚焦：「建立 tmux session 並啟動 Claude」這個故事
 *
 * 不認識任何 adapter，所有具體實作都來自 composition root。
 */

import { buildRunner } from '../composition.js'

async function main() {
  const runner = buildRunner()
  await runner.start(process.cwd())
  // 到這裡：CLI 已就緒
}

main()
