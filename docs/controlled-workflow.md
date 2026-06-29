# OpenCode Controlled Workflow Latest

這是本包整合後的工作流程。

## 角色分層

```text
Odin 主控
├─ Prometheus：制定計畫
├─ Athena：補需求盲點
├─ Solomon：審查計畫
├─ Explore：本地 repo 搜尋
├─ Librarian：外部文件與開源參考
├─ Merlin：架構/除錯/風險顧問
├─ Hephaestus：深度實作
├─ Atlas：todo 執行
├─ Loki：小範圍執行
└─ Multimodal Looker：視覺/PDF/UI 分析
```

## Gate 流程

### 1. Scope Gate
- 目標是什麼？
- 不做什麼？
- 需要哪些權限？
- 是否有危險操作？

### 2. Context Gate
- 讀 README / package / config / tests。
- 用 Explore 找入口與修改點。
- 用 Librarian 查最新外部規範。

### 3. Plan Gate
- Prometheus 產出階段計畫。
- Athena 找隱含假設。
- Solomon 審查 todo 是否可驗證。

### 4. Change Gate
- Hephaestus 或 Atlas 執行。
- 小步修改。
- 每步保留 diff 可讀。

### 5. Verify Gate
- 跑 build/test/lint。
- 無自動測試時做 deterministic manual check。
- 失敗就回到 Change Gate。

### 6. Review Gate
- Merlin 檢查架構/副作用。
- Solomon 檢查 plan 是否仍有缺口。

### 7. Final Gate
最後回報：

```text
完成項目：
- ...

修改檔案：
- ...

驗證：
- ...

剩餘風險：
- ...
```

## Auto Continue 最新整合

- 基本版：AGENTS.md 要求不要因為 todo 未完成就停止。
- 進階版：`.opencode/hooks/lite-auto-continue.plugin.ts` 監聽 idle 並注入 continuation prompt。
- Promise 版：`/ralph-loop` 使用 `<promise>DONE</promise>` 控制完成。

## 推薦起手指令

```text
/controlled-workflow 分析這個專案並完成指定功能，完成前不要停止，最後提供驗證證據。
```

## Add-on Gate: Research → Try → Learn

Insert this gate between Context and Plan whenever the task is error-prone, version-sensitive, blocked, or repeated:

```text
Memory Lookup -> Research Discovery -> Candidate Methods -> Trial Loop -> Ledger Update
```

The agent must search prior success/failure records before external research. External research should prioritize official docs and upstream sources, then community sources. Candidate methods are tried one at a time with rollback. At the end, update `.opencode/memory/` so future sessions can reuse the result.
