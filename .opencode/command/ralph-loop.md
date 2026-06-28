# /ralph-loop — Promise-based Completion Loop

Use a promise marker to control completion.

Rules:
- Continue working until the task is verified.
- Output `<promise>DONE</promise>` only after all todos are completed and verification evidence exists.
- If verification fails, do not output the promise marker; fix the issue and continue.
- If blocked, output `BLOCKED:` with the exact missing decision or permission.

The auto-continue hook template in `.opencode/hooks` can detect missing completion promise and inject the next continuation prompt.
