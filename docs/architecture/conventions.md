# 開發慣例

## 程式碼原則

### 禁止 `process.env.X ?? 'default'`

預設值會讓「環境變數忘了設」的 bug 靜默通過，違反 fail-loud 原則。

- 值固定 → 寫死常數 + 註解（例：`const CLAUDE_BIN = 'claude' // TODO: 抽環境變數`）
- 值需從環境取 → `const x = process.env.X` 後**顯式檢查**：`if (!x) throw new Error('X not set')`
- 還沒決定來源 → 先寫死，等需要再改

## Git 工作流程

### 分支命名
格式：`<type>/短名稱` 或 `<type>/NNN-短名稱`

| Prefix | 用途 |
|--------|------|
| `feat/` | 新功能 |
| `fix/` | 修 bug |
| `refactor/` | 重構 |
| `docs/` | 文件 |

**不可直接 commit 到 `main`。**

### Commit 格式（Conventional Commits）

```
feat: 新增 xxx 功能
fix: 修正 xxx 問題
refactor: 重構 xxx
docs: 更新文件
chore: 雜項調整
```
