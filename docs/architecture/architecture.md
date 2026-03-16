# 架構設計

## 分層規劃（Clean Architecture）— 規劃中，尚未實作

依賴方向：presentation → application → domain ← infrastructure

| 層 | 目錄 | 職責 |
|----|------|------|
| Domain | `src/domain/` | 核心概念與 Port 介面，零外部依賴 |
| Application | `src/application/` | Use Cases，協調 domain 與 port |
| Infrastructure | `src/infrastructure/` | 實作 Port（tmux adapter、env） |
| Presentation | `src/presentation/` | grammY bot，呼叫 use cases |

## 設計決策

### Session 狀態 → Domain Entity
Session 是核心業務概念，放在 domain entity，而非 use case 內的 flag。

### DI → 手動 Wire
目前只有一個 adapter，在 `presentation/bot.ts` 直接組裝，不引入 DI container。規模擴大後再考慮。

### ClaudePort → TmuxClaudeAdapter
透過 Port 介面隔離底層實作，未來替換成其他方案只需換 adapter，application 層不受影響。

## 異動記錄

| 日期 | 異動描述 |
|------|---------|
| 2026-03-14 | 初建：確立 CA 分層規劃、Session entity、手動 Wire、TmuxClaudeAdapter 決策 |
