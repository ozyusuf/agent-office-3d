---
description: Log the session in PROGRESS.md, tick PLAN.md, record decisions, commit, and say what comes next
---

Wrap up this session of agent-office-3d.

1. `docs/PROGRESS.md`: add a new session entry at the top of the log (date, stage) with:
   what was done, what is left, known issues, and the next step. Keep older entries; keep it short.
   Update the "Current state" block at the top.
2. `docs/PLAN.md`: tick (`[x]`) every task that is actually finished and verified. Do not tick
   anything that was not tested.
3. `docs/DECISIONS.md`: append any new decisions made this session (date - decision - why).
   If a decision replaced an older one, say which.
4. If anything in `CLAUDE.md` or `docs/DESIGN.md` is now out of date, fix it (CLAUDE.md max 60 lines).
5. Run `npm test` if tests exist. Report failures honestly; do not commit broken tests silently.
6. `git status`, then stage the relevant files and commit with a short English message
   (`stage N: ...`). Never commit `node_modules/`, local config, or stats files.
7. Tell the user, in Turkish, in a few lines: what was committed and exactly what the next session
   will do (they will type `/next`).

$ARGUMENTS
