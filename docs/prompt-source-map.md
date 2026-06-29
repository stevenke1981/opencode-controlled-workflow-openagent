# Prompt Source Map

本文件說明本包如何把 `code-yeongyu/oh-my-openagent` 的公開 agent 角色抽離成 OpenCode Controlled Workflow 的輕量版。

> 注意：本包不是逐字複製 upstream prompt。為了可維護性與授權安全，所有 agent prompt 都是根據公開角色、文件與原始碼行為做 clean-room 改寫。

## Agent 對照表

| Local agent | Upstream concept | 抽離重點 | Local file |
|---|---|---|---|
| Odin | Default orchestrator | 主控、分派、整合、驗證、完成定義 | `.opencode/agent/odin.md` |
| Hephaestus | Autonomous worker | 長任務實作、最小修改、驗證、修根因 | `.opencode/agent/hephaestus.md` |
| Prometheus | Strategic planner | 計畫、todo、風險與驗證設計 | `.opencode/agent/prometheus.md` |
| Athena | Planning consultant | 需求盲點、假設、任務拆解 | `.opencode/agent/athena.md` |
| Solomon | Plan reviewer | 挑錯、風險、缺測試、unsafe action | `.opencode/agent/solomon.md` |
| Atlas | Todo orchestrator | 按 todo 推進、保持狀態、逐項驗證 | `.opencode/agent/atlas.md` |
| Loki | Category executor | 單一範圍小任務執行 | `.opencode/agent/loki.md` |
| Merlin | Technical advisor | 唯讀架構/除錯/審查/風險顧問 | `.opencode/agent/merlin.md` |
| Librarian | Research/documentation | 官方文件、開源實作、版本與 citation | `.opencode/agent/librarian.md` |
| Explore | Codebase explorer | 本地 repo 搜尋、入口、呼叫鏈、可能修改點 | `.opencode/agent/explore.md` |
| Multimodal Looker | Visual analyst | 圖片、截圖、PDF、UI 與圖表分析 | `.opencode/agent/multimodal-looker.md` |

## Upstream 行為來源

- `packages/omo-opencode/src/agent/*`：agent role factories 與 prompt builder。
- `packages/omo-opencode/src/hooks/todo-continuation-enforcer/*`：todo idle continuation。
- `packages/omo-opencode/src/hooks/ralph-loop/*`：promise-based continuation loop。
- 官方 docs 的 Features / Agents / Team Mode / Hook 說明。

## 改寫原則

1. 保留角色責任，不保留原文長 prompt。
2. 適配 OpenCode 原生 `.opencode/agent/*.md` frontmatter。
3. 對唯讀角色設定 `edit: deny`。
4. 對實作者設定 `edit: ask`，避免未授權破壞。
5. 以 Controlled Workflow Gate 取代複雜 plugin 依賴。
6. Auto-continue 只提供 hook adapter 與 pseudocode，不強迫每個環境直接啟用。
