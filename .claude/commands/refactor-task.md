---
description: Continue REFACTORING_PLAN.md (no args = next unchecked tasks; or pass a task ID)
---

Read `REFACTORING_PLAN.md` at the repo root. Task selector given: "$ARGUMENTS"

**If the selector is a task ID** (e.g. `A3`, `U1`, `B2`): implement exactly that task and nothing else. This is also how Block-2 tasks are invoked (on Opus).

**If the selector is empty:** continue the plan. Find the first unchecked task in the "Suggested order of work" table (Block 1 order), implement it, commit, then move to the next unchecked task. Stop — with a short summary of what was done and what comes next — when you finish the last task of the current step (= table row), or earlier if a task fails. Never start a Block-2 task (B2, F1, F2, F3, the `/code-review` steps) in this mode; if the next unchecked task is Block 2, stop and tell the user to switch to Opus 4.8 and invoke it by ID.

**If the selector is `all`:** same as empty, but do not stop at step boundaries — continue until every Block-1 task is checked or a task fails.

For every task, follow the plan's "How to work on this plan" rules strictly. In particular:

- The change is behavior-preserving. No drive-by reformatting, no scope creep beyond the task description.
- Line numbers in the plan refer to an older commit — if they've drifted, locate the code by symbol/class name instead.
- **One task per commit**, message `refactor(<ID>): <short description>`. Run the task's own verification commands plus the relevant checks until green before committing:
  - backend touched → `make test` and `make lint` from repo root
  - backend response models touched → `make gen-types`, commit the regenerated `frontend/src/api/generated/schema.d.ts` in the same commit, then `cd frontend && npx tsc --noEmit`
  - frontend touched → `cd frontend && npm run check`
- For UI tasks, verify in the browser at mobile width (~375px) and desktop (≥1024px) before committing.
- Tick each finished task's checkbox in `REFACTORING_PLAN.md` (include that edit in the task's commit) and add a short note under the task if anything noteworthy came up.
- If a task turns out substantially larger or different than described, or you fail its definition of done twice: STOP that task. Leave a note under it in the plan explaining what you found, don't commit half-done work, and report back (in no-arg mode: do not continue to further tasks after a failure).
