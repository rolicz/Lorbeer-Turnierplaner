---
description: Implement one task from REFACTORING_PLAN.md (e.g. /refactor-task A3)
---

Read `REFACTORING_PLAN.md` at the repo root, then implement task **$ARGUMENTS** — that task only, nothing else.

Follow the plan's "How to work on this plan" rules strictly. In particular:

- The change is behavior-preserving. No drive-by reformatting, no scope creep beyond the task description.
- Line numbers in the plan refer to an older commit — if they've drifted, locate the code by symbol/class name instead.
- Run the task's own verification commands plus the relevant checks until green:
  - backend touched → `make test` and `make lint` from repo root
  - backend response models touched → `make gen-types`, commit the regenerated `frontend/src/api/generated/schema.d.ts`, then `cd frontend && npx tsc --noEmit`
  - frontend touched → `cd frontend && npm run check`
- For UI tasks, verify in the browser at mobile width (~375px) and desktop (≥1024px) before committing.
- When done: tick the task's checkbox in `REFACTORING_PLAN.md`, add a short note under the task if anything noteworthy came up, and commit everything as one commit with the message `refactor($ARGUMENTS): <short description>`.
- If the task turns out substantially larger or different than described, or you fail its definition of done twice: STOP. Leave a note under the task in the plan explaining what you found, commit nothing half-done, and report back.
