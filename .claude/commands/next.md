---
description: Read the progress docs, summarise the next stage in two sentences, and start it
---

Start the next stage of agent-office-3d.

1. Read `docs/PROGRESS.md` and `docs/PLAN.md`. Find the first stage that still has unchecked boxes.
2. If the stage involves anything visual (HUD, palette, 3D scene, animations), also read
   `docs/DESIGN.md` and look at `docs/design/reference.png`.
3. Read `docs/DECISIONS.md` if you are about to make a choice that may already be decided.
4. Tell the user, in Turkish, in exactly two sentences, which stage is next and what you will build.
5. Start working on that stage right away. Follow every rule in `CLAUDE.md`
   (hooks never block Claude, no made-up data, never touch `~/.claude/settings.json`, verify hook
   fields in the official docs, ask before downloading assets).
6. Work only on this one stage. When it meets its "Done when" criterion, stop. Then tell the user
   in Turkish, briefly, what you did and give step-by-step instructions to try it. Suggest `/wrap`.

$ARGUMENTS
