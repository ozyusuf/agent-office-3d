# Changelog

What changed in each version of agent-office-3d, newest first. How to update: see
[Update](README.md#update) in the README. The version you are running is shown at
http://127.0.0.1:7847/health.

## Unreleased

**Linux and macOS.** agent-office-3d now installs and runs there too.

- New hook `hooks/send-event.sh` (`sh` + `curl`), with the same rules as the Windows one: it never
  prints anything, never blocks Claude and exits at once when the server is not running.
- `install.sh` / `uninstall.sh` use the same installer core as Windows: the change to
  `~/.claude/settings.json` is shown as a diff, written only after a `y`, with a backup first.
- `scripts/start.sh` / `scripts/stop.sh` start the server in the background and stop it. The README
  has a systemd unit for starting it on login.

Windows users: nothing changes, the PowerShell hook and installer are the same.

## 0.3.0 - 2026-10-09

**See from across the room whether Claude needs you.**

- The window frame turns **green** when the task is done (your turn) or a new session waits for its
  first prompt, **yellow** when Claude needs you, **red** on an error. No colour while Claude works.
- A small bubble over the character: a hopping **?** when Claude asks you a question or wants a
  plan approved, a hopping **!** when it needs a permission, **✓** when it is done, **✕** on an error.
- The status at the top right shows how long it has been so, e.g. "Done · 4m 05s", and the
  browser tab title starts with it.
- Questions (AskUserQuestion) and plan approvals (ExitPlanMode) now count as waiting for you
  instead of working.
- New setting: **Status frame** (on / off).

After updating: nothing else to do. The hook did not change.

## 0.2.0 - 2026-10-09

**Lower CPU use.** The 3D view now draws only as many frames as its motion needs: 60 fps while
the character walks to another station, 30 fps while a session runs, and 15 fps when no session
runs or a finished turn has been quiet for a minute. Measured on a laptop with integrated
graphics, it uses about 35-65 % less CPU than 0.1.0, depending on what is on screen.

- New setting: **Max frame rate** (60 / 30) under *3D graphics* in the settings panel. Choose 30
  on a slow machine or to save battery.
- The settings panel shows the current frame rate and pace (full rate / calm / resting).
- The scene draws fewer objects per frame; the picture is the same.
- The status dot next to "Working" no longer pulses (the pulsing kept the browser busy).

After updating: nothing else to do. The hook did not change.

## 0.1.0 - 2026-10-09

First public version: the 3D monitor, the HUD, the settings panel, English and Turkish, the
installer and uninstaller, desktop and log-in shortcuts.
