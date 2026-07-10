---
name: solution-trial-loop
description: Use after research produces multiple candidate methods to test one hypothesis at a time with a baseline, rollback plan, verification, and retained or reverted decision.
---

# Solution Trial Loop

Use this skill after Research Discovery has produced multiple possible methods. Try methods one by one, with rollback and evidence.

## Rules

1. Try one method at a time.
2. Before each attempt, record baseline:
   - current git status/diff
   - failing command/output summary
   - hypothesis
3. Make the smallest change that tests the hypothesis.
4. Run the narrowest verification command.
5. If it fails, capture the new error signature and either refine or rollback.
6. Do not keep stacking unrelated fixes.
7. After success, run a broader verification if practical.

## Attempt Record

Call `memory_add type=decision` during the session:

```markdown
### Attempt: <short name>
- Time:
- Hypothesis:
- Change:
- Command:
- Result:
- Evidence:
- Decision: keep / rollback / refine
```

## Stop Conditions

Stop the trial loop when:

- A candidate passes the defined verification.
- All candidates fail and more research is needed.
- A dangerous operation or credential is required.
- The same error signature repeats after 3 materially different attempts.
- The change scope is expanding beyond user intent.

## Output

```markdown
## Trial Results
| Attempt | Result | Evidence | Decision |
|---|---|---|---|

## Winning Method
- Summary:
- Files changed:
- Verification:

## Failed Methods
- Method:
- Why failed:
- Avoid next time:
```
