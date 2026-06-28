# Experience Ledger

Use this skill at the beginning and end of every non-trivial task.

## Start-of-Task Lookup

Before researching or editing, read:

- `.opencode/memory/solution-index.md`
- `.opencode/memory/success-ledger.md`
- `.opencode/memory/failure-ledger.md`
- `.opencode/memory/patterns.md`

Look for matching:

- repo name or module
- language/framework/tool
- exact error substring
- platform, compiler, runtime, package manager
- prior working commands

## End-of-Task Recording

After each meaningful task, append:

- Successes to `success-ledger.md`.
- Failures or dead ends to `failure-ledger.md`.
- Generalized lessons to `patterns.md`.
- Attempt chronology to `decision-log.md`.
- Searchable tags to `solution-index.md`.

## Success Record Format

```markdown
## <YYYY-MM-DD> — <short title>
- Tags: #rust #cmake #windows #opencode
- Context:
- Symptom:
- Root cause:
- Working solution:
- Verification:
- Files/commands:
- Reuse when:
- Avoid:
```

## Failure Record Format

```markdown
## <YYYY-MM-DD> — <short title>
- Tags:
- Context:
- Failed method:
- Error/result:
- Why it failed:
- Do not repeat when:
- Better next attempt:
```

## Quality Bar

A record is useful only if a future agent can search it and decide whether to reuse or avoid the method.
