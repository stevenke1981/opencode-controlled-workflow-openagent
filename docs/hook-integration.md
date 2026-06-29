# Hook Integration — Auto Continue + Ralph Loop Lite

本包整合兩種 continuation pattern：

1. **Todo Continuation**：OpenCode session idle 時，若 todo 尚未完成，注入一段 internal prompt 繼續下一項任務。
2. **Promise Loop**：使用 `<promise>DONE</promise>` 當完成標記。未看到 promise 且未被 blocker 停止，就繼續下一輪。

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

`.opencode/hooks/lite-auto-continue.plugin.ts` 內建以下保護：

- cooldown：避免短時間重複注入。
- stagnation：相同 todo 多輪無進展時停止。
- failure counter：連續注入失敗達上限停止。
- max iterations：避免無限 loop。
- skip read-only agents：Explore/Librarian/Merlin/Solomon/Athena 等唯讀角色不自動推進。
- stop patterns：遇到 `BLOCKED:`、`PERMISSION_REQUIRED:`、`TOKEN_LIMIT:` 等停止。
- waiting-for-user detection：看到需要使用者確認時停止。

## 建議啟用方式

1. 先只使用 agent/command，不啟用 hook。
2. 在小型 repo 中測試 `.opencode/hooks/lite-auto-continue.plugin.ts`。
3. 確認你的 OpenCode/plugin SDK 的事件與 prompt API 名稱。
4. 逐步放寬權限，不要一開始允許 destructive command。

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

`lite-auto-continue.plugin.ts` 是 clean-room 參考 adapter。不同 OpenCode 版本的 plugin API 可能不同，你需要依本機版本調整 `ctx.events`、`client.session.todo`、`client.session.messages`、`client.session.promptAsync` 等呼叫名稱。

## Research Learn Loop Plugin

The previous auto-continue hook can be extended with a memory-first research layer. See:

- `.opencode/plugins/research-learn-loop.plugin.ts`
- `.opencode/plugins/research-learn-loop.config.jsonc`

The plugin prompt tells the continuing agent to first search `.opencode/memory/`, then use research and trial-loop skills before making repeated changes. This keeps auto-continue from repeating the same failed method.
