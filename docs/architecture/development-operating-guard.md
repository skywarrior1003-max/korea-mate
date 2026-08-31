# Development Operating Guard (gokoreamate)

Short, practical rules for AI-assisted development (Claude / GPT prompts). Owner-confirmed 2026-08-31 (TASK-MY-TRIP-RELEASE-CLOSURE-AND-DEV-OPERATING-GUARD-V1). This document does not replace the Scheduler V2 SSOT or the decision ledger — it says how work proceeds between them.

## North Star / Intent Preservation
- Bug fixes and reinforcements that serve the existing product intent proceed freely.
- Implementation may change whenever evidence says so. "Keeping the current implementation" is not a goal by itself.
- What must not drift silently: product meaning, user choice, confirmed contracts (This Trip input, `__v:2` storage, Story structure, fixed/time semantics, Final place data authority).

## Auto-Fix Zone (no Owner re-approval; same task: root cause → fix → real QA)
- obvious bugs · wrong data mapping · UI/locale errors · performance defects · unrealistic scheduler output
- test ≠ real product mismatches · regressions directly connected to the current task
- implementation changes that reinforce the existing product intent

## Ask Zone (ask the Owner first)
- changing existing product meaning or a behaviour contract · reducing user choice · removing a confirmed feature
- a new schema/migration that changes product meaning · a new external provider · a change of release priority
- a task that would expand into another product area · genuinely different reasonable product directions where the Owner's choice is needed

## Prompt vs Reality (trust order)
1. latest Owner decision → 2. actual repo / code / data → 3. SSOT → 4. the prompt's description of the implementation.
A small false premise in a prompt is corrected and the task continues — no "verification report only, task stopped" for minor premise errors. Stop (HOLD) only when the conflict can only be resolved by changing product meaning or a confirmed contract.

## Change Delta (internal, ≤ 5 lines before an important change)
finding · root cause · change · invariant kept · direction impact. No long mid-task reports.

## Direction Delta (end of every completion report, short)
- product direction changed? · implementation-only change? · new Owner decision needed? · new blocker?
- SSOT / ledger are updated only on a real direction change or a milestone closure — not on every task.

## Production SQL Separation
- **CODE task**: may prepare code, data artifacts and SQL. Never executes Production SQL.
- **PROD-SQL task**: no code or repo file changes; only prebuilt SQL precheck → execute → read-back. If the working tree changes during a PROD-SQL task → HOLD.
- Every Production SQL is self-verifying (precondition · targeted UPDATE with current-value predicates · row-count RAISE · postcondition) and carries rollback values.

## Standing safety rules (unchanged)
Production READ-ONLY by default · no secrets in logs/reports · no `git add -A`, no master push, no deploy from tasks · Final place data is authoritative (code never overwrites coordinates; corrections are data artifacts + Owner SQL) · Production AI OFF · release HOLD is cleared only by the Owner after visual review.
