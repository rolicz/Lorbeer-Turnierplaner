# Claude Code entry point

@AGENTS.md

## Claude-specific notes

- `AGENTS.md` is the canonical, tool-agnostic knowledge file. When you learn something
  non-obvious (deploy quirk, data semantic, decision), write it there — not only into
  auto-memory — so it survives model and tool switches.
- Auto-memory for this project lives in
  `~/.claude/projects/-home-roli-projects-turnierplaner-reloaded/memory/` (index: `MEMORY.md`).
  It holds Roli's working preferences (commit only when asked, model policy, planning workflow).
- Project slash command: `/refactor-task` (`.claude/commands/refactor-task.md`) — the pattern for
  plan-driven implementation sessions.
- Never read or print `backend/secrets.json`.
- Do not bind ports 8000 / 8001 / 8010 / 5173 for verification stacks; use spare ports and a
  copy of the DB.
