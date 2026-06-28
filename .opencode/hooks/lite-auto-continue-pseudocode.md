# Lite Auto Continue Pseudocode

```text
on session.idle(sessionID):
  if config.enabled is false: return

  messages = read session messages
  todos = read session todos

  if user cancelled: return
  if latest assistant is waiting for user: return
  if background task running: return
  if all todos complete/cancelled and completion promise found: return
  if destructive permission required: return
  if cooldown active: return
  if max iterations reached: return
  if same todo fingerprint repeated > maxStagnationCount: return
  if consecutive failures > maxConsecutiveFailures: return

  lastRun = find last assistant run metadata
  agent/model/tools = inherit from lastRun

  inject async prompt into same session:
    "Incomplete todos remain. Continue next pending task..."
```

The important design is not the exact wording. The important design is:

1. Listen to idle.
2. Read objective progress signals.
3. Refuse to continue when user input or safety permission is required.
4. Inject a short internal continuation prompt into the same session.
5. Keep cooldown and stagnation guards.
```
