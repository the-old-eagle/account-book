# account-book 分支规则

> 适用于 account-book 私有仓库（记账网页：Excel 数据源 + GitHub Pages 部署）。
> 本规则定义分支模型、命名约定、commit 规范与合并流程，保障 main 始终可发布。

---

## 1. 主分支 main

- `main` 为**受保护分支（protected branch）**，是唯一可发布/部署的稳定分支。
- **仅接受通过合并（merge / PR）引入变更，禁止任何形式的直接 `git push`。**
- `main` 上的每次合并都应来自一个已通过测试的功能分支。
- 合并前必须保证：自动化测试全绿、构建产物可正常生成、不破坏现有功能。

## 2. 功能分支

- 所有开发工作均从 `main` 最新提交切出功能分支，完成后再合并回 `main`。
- **命名格式：`feature/模块名`**，模块名使用小写英文与短横线（kebab-case），简明对应功能模块。
- 示例：

  | 分支名 | 说明 |
  |---|---|
  | `feature/initial-scaffold` | 项目初始脚手架（页面骨架、目录结构、部署配置） |
  | `feature/auth` | 账户登录鉴权模块 |
  | `feature/import` | Excel 数据导入解析模块 |
  | `feature/export` | 账单导出模块 |
  | `feature/statistics` | 统计图表模块 |

- 切分支前先同步远程：`git checkout main && git pull origin main`，再 `git checkout -b feature/模块名`。

## 3. Commit 信息规范

采用 **Conventional Commits** 风格：`type(scope): subject`

- **type**（必填，小写）：提交类型，取值如下：

  | type | 含义 |
  |---|---|
  | `feat` | 新功能 |
  | `fix` | Bug 修复 |
  | `docs` | 文档变更 |
  | `style` | 代码格式调整（不影响功能：空格、分号、缩进等） |
  | `refactor` | 重构（既非新增功能也非修复 Bug） |
  | `test` | 新增或修改测试用例 |
  | `chore` | 构建、依赖、脚本、配置等杂项 |

- **scope**（必填）：模块名，与功能分支模块名保持一致（如 `auth`、`import`、`scaffold`）。
- **subject**（必填）：简明描述本次提交内容，祈使句、小写开头、结尾不加句号，建议 ≤ 50 字符。

### 示例

```
feat(auth): 新增账户登录与鉴权拦截
fix(import): 修复多 sheet 表头错位导致金额解析失败
docs(scaffold): 补充分支规则与项目全流程说明
chore(deploy): 配置 GitHub Pages 自动发布工作流
test(statistics): 补充月度收支统计单元测试
```

## 4. 提交与推送

- 每个功能模块开发完成后，按规范生成 commit。
- commit 粒度遵循「单一职责」：一个 commit 只做一件事，避免混合多个无关改动。
- 提交后将功能分支推送到对应远程分支：
  ```
  git push -u origin feature/模块名
  ```
- 推送前确保本地已通过 lint 与测试。

## 5. 测试与合并

- 功能分支推送后运行自动化测试（单元 + 集成），全部通过方可合并。
- **每轮 feature 开发与测试通过后，自动将该功能分支合并回 `main`**（自动化流水线执行）。
- 合并方式默认采用 `--no-ff`，保留分支历史，便于追溯每个 feature 的完整提交链。
- 合并到 `main` 前再次确认 `main` 为受保护分支，仅经此合并路径引入变更。

## 6. 分支清理

- 功能分支成功合并到 `main` 后，**可删除该功能分支**（本地与远程）：
  ```
  git branch -d feature/模块名
  git push origin --delete feature/模块名
  ```
- 长期未合并、已废弃的功能分支应定期清理，保持分支列表整洁。
- `main` 永不删除；不建议长期保留 hotfix 分支，修复类工作同样走 `feature/` 流程。

---

## 流程速览

```
main (受保护, 禁止直接推送)
  │
  ├─ git checkout -b feature/模块名      ← 从 main 切出
  │       │
  │       ├─ 开发 + 规范 commit (type(scope): subject)
  │       ├─ git push -u origin feature/模块名
  │       └─ 运行测试
  │              │
  │              └─ 测试通过 ──┐
  │                            ▼
  └──── 自动合并 (--no-ff) 回 main
                 │
                 └─ 删除功能分支
```
