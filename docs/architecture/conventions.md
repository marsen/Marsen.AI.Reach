# 開發慣例

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
