# OpenCode Controlled Workflow + OpenAgent Agents Lite

這是一個「輕量化、OpenCode 原生規範、受控自動持續執行」的開發團隊包。

它參考 `oh-my-openagent` 的 agent 分工與 auto-continue 思路，但沒有逐字複製上游 prompt。此包採用 clean-room 重寫：保留角色職責、權限邊界、驗證 gate、todo continuation、Ralph-style completion promise 與 evidence-driven 完工標準。

## 目標

- 新增 **Research → Try → Learn**：先查成功/失敗紀錄，再搜尋官方文件、upstream、社群、MCP/skills，整理多個解法後逐一嘗試，最後把成功與失敗寫回經驗庫。

- 將大型多代理系統壓縮成 OpenCode 可直接讀取的 `.opencode/agent/*.md`。
- 讓主 agent 用 todo、驗證證據與停止條件持續完成任務。
- 將 `session.idle -> incomplete todos -> continuation prompt` 的 hook 方案整理成可移植範本。
- 避免失控：加入 cooldown、stagnation、pending-question、background-task、failure-count、token-limit 等 guard。

## 內容

```text
.
├── AGENTS.md
├── opencode.jsonc
├── install.ps1
├── install.sh
├── docs/
│   ├── controlled-workflow.md
│   ├── hook-integration.md
│   ├── prompt-source-map.md
│   └── safety-boundaries.md
├── .opencode/
│   ├── agent/
│   │   ├── odin.md
│   │   ├── hephaestus.md
│   │   ├── prometheus.md
│   │   ├── athena.md
│   │   ├── solomon.md
│   │   ├── atlas.md
│   │   ├── loki.md
│   │   ├── merlin.md
│   │   ├── librarian.md
│   │   ├── explore.md
│   │   └── multimodal-looker.md
│   ├── command/
│   │   ├── start-work.md
│   │   ├── controlled-workflow.md
│   │   ├── ultrawork.md
│   │   ├── ralph-loop.md
│   │   ├── verify.md
│   │   ├── review.md
│   │   └── fix.md
│   ├── skills/
│   │   ├── auto-continue/SKILL.md
│   │   ├── evidence-gate/SKILL.md
│   │   └── opencode-qa-lite/SKILL.md
│   └── hooks/
│       ├── lite-auto-continue.plugin.ts
│       ├── lite-auto-continue.config.jsonc
│       └── lite-auto-continue-pseudocode.md
└── optional/
    └── oh-my-openagent/oh-my-openagent-controlled.jsonc
```

## 安裝到你的專案

Windows PowerShell：

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\install.ps1 -ProjectPath "E:\your-project"
```

Linux/macOS/Git Bash：

```bash
chmod +x ./install.sh
./install.sh /path/to/your-project
```

若直接在專案根目錄執行：

```bash
./install.sh .
```

## 使用方式

進入 OpenCode 後：

```text
/start-work 實作 XXX 功能，完成後請驗證
```

或更強制：

```text
/controlled-workflow 修復所有測試失敗，直到測試通過才停止
```

或 Ralph-style：

```text
/ralph-loop 將專案完成到可 build、可 test、可提交；完成時輸出 <promise>DONE</promise>
```

## Auto Continue 的核心

本包的 hook 範本使用以下流程：

```text
session.idle
  -> 讀取 todos
  -> 若仍有 pending / in_progress
  -> 檢查是否正在等使用者、背景任務、冷卻、停滯、連續錯誤
  -> 注入 internal continuation prompt
  -> 同一 session 繼續工作
```

預設守門條件：

- 沒有 todo 或全部完成：停止。
- 使用者明確 stop/cancel：停止。
- agent 正在等使用者回答：停止。
- 連續沒有進展：停止。
- 連續失敗超過上限：停止。
- 權限、認證、token limit、環境缺失：停止並報告。

## 重要聲明

此包不是 oh-my-openagent 的完整替代品，也沒有包含上游完整 plugin。它是 OpenCode controlled workflow 的輕量整合版：agent prompt 為重寫版，hook 為可移植範本。若你已安裝 oh-my-openagent，可使用 `optional/oh-my-openagent/oh-my-openagent-controlled.jsonc` 作為相容設定參考。


## 新增：Research → Try → Learn 自我改進層

這版新增一組 workflow skills 與 SQLite 記憶系統：

```text
.opencode/skills/
├── research-discovery/SKILL.md
├── community-research/SKILL.md
├── mcp-skill-scout/SKILL.md
├── solution-trial-loop/SKILL.md
├── experience-ledger/SKILL.md
└── self-improvement/SKILL.md

.opencode/memory/
├── memory.db           ← SQLite 資料庫（主要儲存）
├── success-ledger.md   ← 保留為人類可讀快照
├── failure-ledger.md
├── ...
```

新增指令：

```text
/research-fix <問題或錯誤>
/learned-fix <問題或錯誤>
/mcp-scout <任務>
/try-solutions <候選方法>
/retrospective
/knowledge-sync
```

推薦用法：

```text
/research-fix 修復 Windows CMake build 失敗，先找過去成功紀錄、官方文件、GitHub issue 與社群方法，逐一嘗試並記錄成功/失敗經驗
```

## OpenCode 規範調整

- Custom commands 使用 `.opencode/commands/*.md`；同時保留 `.opencode/command/*.md` 相容舊包。
- Plugin 參考實作放在 `.opencode/plugins/research-learn-loop.plugin.ts`；同時保留 `.opencode/hooks/` 作為 hook 概念與相容參考。
- Skills 使用 `.opencode/skills/<name>/SKILL.md`。

## 安全提醒

社群搜尋與 MCP 使用必須遵守：

- 不把 secrets、tokens、私有 repo 內容、完整私有 log 傳到外部。
- MCP 若能改檔、發 PR、改 issue、碰雲端或資料庫，必須得到明確授權。
- 社群答案只能當候選方法，本地驗證通過後才記入成功紀錄。

## SQLite 記憶系統（取代舊版 Markdown Ledgers）

記憶系統使用 **SQLite**（`sql.js` WASM，無原生相依）取代舊的分散式 Markdown 檔案。進入 OpenCode 後，agent 可以直接呼叫：

```text
memory_search  # SQLite 全文搜尋成功/失敗/決策/研究紀錄
memory_read    # 依 id 讀取完整記憶 entry
memory_add     # 新增成功、失敗、模式、決策、研究來源、備註
memory_list    # 列出記憶庫摘要（總數、類型分佈、最近 5 筆）
```

核心檔案：

```text
.opencode/tools/memory.ts         ← SQLite 版記憶工具
.opencode/tools/memory-db.ts      ← 共享資料庫模組
.opencode/tools/migrate-to-sqlite.ts  ← 從 Markdown 遷移到 SQLite
.opencode/memory/memory.db        ← SQLite 資料庫
.opencode/plugins/memory-lifecycle.plugin.ts
.opencode/skills/persistent-memory/SKILL.md
docs/memory-tools-and-plugins.md
```

推薦工作流：

```text
/memory-first Windows CMake C4819 warning opencode permission loop
```

然後要求 agent：

```text
先用 memory_search 查過去成功紀錄與失敗紀錄，再嘗試修法；成功後用 memory_add type=success 記錄證據，失敗也用 memory_add type=failure 記錄。
```

Memory plugin 預設保守啟用：它會在 session created / idle / compacted 等 lifecycle 事件留下 audit 或提醒；不同 OpenCode 版本的 SDK 注入 API 可能不同，所以 prompt injection 採 defensive 寫法，不會阻塞正常工作。
