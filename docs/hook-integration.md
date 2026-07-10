# Hook Integration — Auto Continue + Ralph Loop Lite

本包整合三種 session lifecycle pattern：

1. **Todo Continuation**：OpenCode session idle 時，若 todo 尚未完成，注入一段 internal prompt 繼續下一項任務。
2. **Promise Loop**：使用 `<promise>DONE</promise>` 當完成標記。未看到 promise 且未被 blocker 停止，就繼續下一輪。
3. **Hermes Review**：有 durable signal 的 main session idle 後，建立受限 child session 審查記憶與技能。

## 為什麼需要 hook

AGENTS.md 只能影響模型行為，不能在 session 停止後自動送出下一則訊息。真正的 auto continue 需要：

```text
session.idle event
  -> read todos/messages
  -> check stop guards
  -> inject async continuation prompt
  -> same session continues
```

## Lite guard 設計

實際載入的 `.opencode/plugins/research-learn-loop.plugin.ts` 內建以下保護：

- cooldown：避免短時間重複注入。
- stagnation：相同 todo 多輪無進展時停止。
- failure counter：連續注入失敗達上限停止。
- SDK response normalization：正確處理 `{ data, error }`。
- child-session guard：subagent / Hermes review session 不再觸發主迴圈。
- abort/token/compaction guard：取消、context overflow 或剛壓縮時不重試。
- stop patterns：遇到 `BLOCKED:`、`PERMISSION_REQUIRED:`、`TOKEN_LIMIT:` 等停止。
- waiting-for-user detection：看到需要使用者確認時停止。

## 建議啟用方式

1. 使用 `opencode debug config` 確認 plugins 可載入。
2. 在小型 repo 建立未完成 todo，觀察一次 idle continuation。
3. 測試 pending question、abort、token limit 與 compaction 停止條件。
4. 保持 destructive command 權限為 deny/ask。

## Continuation Prompt

```text
[SYSTEM DIRECTIVE - CONTROLLED AUTO CONTINUE]
Incomplete work remains. Continue the next pending or in-progress task.
Do not ask the user unless blocked by missing requirements, dangerous operation, or permission requirement.
Run relevant verification before marking any task complete.
Stop only when all todos are completed/cancelled or a real blocker exists.
```

## Ralph Loop 使用方式

在大型任務中使用：

```text
/ralph-loop Build feature X
```

要求 agent：

- 未完成時繼續。
- 驗證通過後才輸出 `<promise>DONE</promise>`。
- 若卡住，輸出 `BLOCKED:` 並說明缺什麼。

## 注意

`.opencode/hooks/lite-auto-continue.plugin.ts` 保留為概念參考；OpenCode
實際 auto-discover 的版本位於 `.opencode/plugins/`，使用目前的 `event`
hook、`client.session.todo/messages/promptAsync` 與 directory query。

## Research Learn Loop Plugin

The previous auto-continue hook can be extended with a memory-first research layer. See:

- `.opencode/plugins/research-learn-loop.plugin.ts`
- `.opencode/plugins/research-learn-loop.config.jsonc`

The plugin prompt tells the continuing agent to first search `.opencode/memory/`, then use research and trial-loop skills before making repeated changes. This keeps auto-continue from repeating the same failed method.

## Hermes Review Plugin

`.opencode/plugins/hermes-self-evolution.plugin.ts` 會：

- 只審查 main session，並用 cooldown/message-count 去重。
- 建立帶 `parentID` 的隔離 child session。
- 限制 child tools 與 session permissions。
- 對 transcript 做長度限制與 secret-like redaction。
- 將 MCP fragments 透過 `config` hook 合併；預設 disabled。
- 將完成摘要寫入 ignored runtime JSONL，不污染 tracked ledger。
