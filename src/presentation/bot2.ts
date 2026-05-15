/**
 * bot2.ts — 程式進入點（主服務）
 * 只聚焦：「建立 tmux session 並啟動 Claude」這個故事
 *
 * 只依賴 port 介面（透過 composition root 取得 instance），不認識任何 adapter。
 */

import { cliRunner } from '../composition.js'

await cliRunner.start(process.cwd())
// 到這裡：CLI 已就緒
