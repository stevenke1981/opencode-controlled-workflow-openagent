# OpenCode Controlled Workflow + Hermes Evolution

一個 clean-room、輕量、可驗證的 OpenCode 開發團隊包。它參考
[`code-yeongyu/oh-my-openagent`](https://github.com/code-yeongyu/oh-my-openagent)
的 agent routing、todo continuation、Ralph loop、skill discovery 與安全守門，
並加入 Hermes-style 自我演化層。

本專案不是上游完整 plugin 的 vendor 或 fork。上游相容設定以
`fb74d777`（2026-07-11）為已驗證基準；本地實作維持小型、可審查、可獨立安裝。

## 主要能力

- 受控流程：`Intake → Scope → Plan → Implement → Verify → Review → Evidence`。
- 11 個明確分工的 OpenCode agents，另加隔離的 `hermes-reviewer`。
- `session.idle` todo continuation，含取消、token limit、pending question/tool、
  cooldown、stagnation、failure backoff 與 child-session guard。
- Research → Try → Learn：先查專案記憶，再研究、單一假設試驗、驗證、沉澱。
- 零外部相依的 Bun SQLite 記憶工具：`memory_search/read/add/list`。
- Model audit：在每次 LLM 呼叫前記錄實際解析的 provider、model、reasoning effort、agent 與 session。
- Hermes background review：有意義的回合結束後建立獨立 child session，
  僅允許 memory、skill 與受控 evolution tools。
- 可新增或更新 skills、MCP fragments、plugin proposals、hook proposals。
- 可回復 curator：只處理 `metadata.created_by: hermes-review` 的技能，
  apply 前先備份；背景 review 僅能 dry-run。
- `/learn` 可從目錄、URL、筆記或對話建立可重用知識。

## Hermes 自我演化流程

```text
parent session idle
  → 檢查 main session / 新訊息 / cooldown / durable signal
  → 建立 [hermes-review] child session
  → deny-all permissions + memory/evolution allowlist
  → memory_search / evolution_inspect
  → memory_add 或 SHA-256 guarded skill update
  → MCP 以 disabled fragment 建立
  → plugin/hook 只產生 proposal
  → curator dry-run
  → 將 redacted review 摘要寫入 runtime audit
```

安全邊界：

- 背景 reviewer 不能執行 shell、任意 edit/write、webfetch、提問或再分派。
- 更新既有 skill/support/integration 必須提供目前 SHA-256。
- 路徑穿越、symlink/junction、超大 support file、明文 secret、
  network-to-shell MCP command 會被拒絕。
- MCP 預設 `enabled: false`；只有 HTTPS 或 localhost HTTP remote endpoint。
- 背景 reviewer 即使傳入 live flag，也不能啟用 plugin/hook 可執行碼。

## 專案結構

```text
.
├── AGENTS.md
├── opencode.jsonc
├── install.ps1 / install.sh
├── scripts/validate.mjs
├── tests/evolution-core.test.ts
├── docs/
├── optional/oh-my-openagent/oh-my-openagent-controlled.jsonc
└── .opencode/
    ├── agent/                  # Odin team + hermes-reviewer
    ├── command/ + commands/    # workflow, /learn, /hermes-curate
    ├── skills/                 # native YAML-frontmatter skills
    ├── tools/
    │   ├── memory.ts
    │   └── evolution.ts
    ├── lib/evolution-core.ts
    ├── plugins/
    │   ├── memory-lifecycle.plugin.ts
    │   ├── research-learn-loop.plugin.ts
    │   ├── model-audit.plugin.ts
    │   └── hermes-self-evolution.plugin.ts
    ├── evolution/
    │   ├── mcp/                # reviewed, disabled-first fragments
    │   └── proposals/          # non-live plugin/hook proposals
    └── memory/                 # per-project experience database + runtime audit
```

本地 `.opencode/plugins/*.ts` 由 OpenCode 自動探索，所以 `opencode.jsonc`
不重複列出相同路徑，避免同一 plugin 執行多次。

Model audit 寫入：

```text
.opencode/memory/.runtime/model-audit.jsonl
```

每筆 JSONL 只包含時間、session、agent、provider、model、effort、effort 來源與可用的 variant；不保存 prompt、response、API key、headers 或完整 provider options。

## 安裝

### 安裝到單一專案

Windows PowerShell：

```powershell
.\install.ps1 -Scope Project -ProjectPath "E:\your-project" -WhatIf
.\install.ps1 -Scope Project -ProjectPath "E:\your-project"
```

Linux/macOS/Git Bash：

```bash
./install.sh --scope project --project-path /path/to/project --dry-run
./install.sh --scope project --project-path /path/to/project
```

### 安裝到使用者層 OpenCode

全域安裝只新增 auto-discovered agents、commands、skills、tools、plugins
與支援檔；它不覆寫既有全域 `AGENTS.md` 或 `opencode.jsonc`。

```powershell
.\install.ps1 -Scope Global -WhatIf
.\install.ps1 -Scope Global
```

```bash
./install.sh --scope global --dry-run
./install.sh --scope global
```

同名檔案會先備份到目標下的
`.controlled-workflow-backups/<timestamp>/`。資料庫、WAL、vector index、
review logs、model audit、curator archive/backup 等 runtime artifacts 不會被當成模板複製。

安裝或修改 config-time 檔案後，必須完整退出並重新啟動 OpenCode。

## 使用

```text
/start-work 實作 XXX 功能，完成後驗證
/controlled-workflow 修復所有測試失敗，直到驗證通過
/research-fix Windows CMake C4819
/learn from ./docs/internal-api
/learn https://example.com/official-docs
/hermes-curate
/ralph-loop 完成到可 build、可 test；驗證後才輸出 <promise>DONE</promise>
```

Evolution tools：

- `evolution_inspect`：列出或讀取資產與 SHA-256。
- `evolution_skill`：建立/更新 native OpenCode skill。
- `evolution_support`：寫入 skill 的 references/templates/scripts/assets。
- `evolution_integration`：註冊 disabled MCP 或建立 plugin/hook proposal。
- `evolution_curate`：dry-run 或備份後封存 Hermes-created skills。

Memory tools：

- `memory_search`：以關鍵字、類型、tags 搜尋。
- `memory_read`：依 ID 讀取完整記錄。
- `memory_add`：新增 success/failure/pattern/decision/research/note。
- `memory_list`：顯示總數、類型分佈與最近記錄。

## 與官方 oh-my-openagent 共存

若已使用官方 runtime，將
[`optional/oh-my-openagent/oh-my-openagent-controlled.jsonc`](optional/oh-my-openagent/oh-my-openagent-controlled.jsonc)
複製為 `.opencode/oh-my-openagent.jsonc`。該檔使用直接 snake_case schema：
`team_mode`、`ralph_loop`、`disabled_hooks`，不再使用舊版 wrapper 或
camelCase 假想欄位。

本安裝器不會自動安裝、移除或替換官方 runtime，也不會停用主人現有的
`oh-my-opencode-slim`；這些會改變整個 OpenCode runtime 的操作需要另外明確決定。

## 驗證

```powershell
node scripts\validate.mjs .
bun test tests\evolution-core.test.ts tests\memory-db.test.ts tests\plugin-lifecycle.test.ts tests\installers.test.ts
opencode debug config
opencode debug skill
opencode agent list
opencode mcp list
```

OpenCode CLI 會共用 SQLite；診斷指令應逐項執行，不要同時啟動多個
`opencode` process，否則可能出現 `database is locked`。

## 限制

- OpenCode child session 仍會保存在 OpenCode session DB；它不像 Hermes
  Agent 的 `_persist_disabled` 能完全不落盤。因此本實作限制 transcript
  長度、先遮蔽 secret-like 內容，並隔離 tool permissions。
- Plugin/hook proposal 的啟用仍需要 foreground review 與 OpenCode restart。
- Model audit 的 effort 取自 `chat.params` 已解析 options；若 provider 沒有提供明確 effort，會記錄 `default` 與 `provider-default`。
- 此包只對齊上游公開行為與目前 OpenCode API，不宣稱包含上游全部功能。
