# agent-office-3d

A cyber-RPG style live monitor for [Claude Code](https://code.claude.com). It runs in a narrow
browser window next to your editor and shows what the agent is doing right now: which tool it is
using, which file it is reading or editing, when it waits for your permission, how full the context
is getting and how long the session has been running.

> **Work in progress.** The HUD layer works (stage 2 of 6). The 3D isometric scene, animations,
> a settings panel and a one-step installer are still to come. See [docs/PLAN.md](docs/PLAN.md).

## How it works

```
Claude Code hooks -> local server (127.0.0.1 only) -> WebSocket -> browser page
```

- Claude Code [hooks](https://code.claude.com/docs/en/hooks) run `hooks/send-event.ps1`, which
  forwards each hook event to a small Node.js server on your machine. Hooks run asynchronously and
  stay silent, so they never slow Claude down; if the server is not running they exit quietly.
- The server keeps the session state (current tool, context fill, effort, session time, XP) and
  pushes it to the page. Every number on screen comes from a real hook event.

## Requirements

- Windows 10/11 with Windows PowerShell 5.1 (the hook script is PowerShell for now)
- Node.js 20 or newer
- Claude Code

## Try it

```
git clone https://github.com/ozyusuf/agent-office-3d.git
cd agent-office-3d
npm install
npm start
```

Open http://127.0.0.1:7847 in a narrow browser window, then use Claude Code **inside this folder**:
the hooks are registered in this repo's `.claude/settings.json`, so they only run for sessions
started here. (An installer that adds them to your global settings, with a backup, is planned.)

- Raw event stream for debugging: http://127.0.0.1:7847/debug.html
- Settings: copy `config.example.json` to `config.json` (language `en`/`tr`, agent name, title,
  port, bar scales) and restart the server.
- Tests: `npm test`

## Privacy

Everything stays on your machine. The server listens on 127.0.0.1 only, checks Host/Origin headers
and never calls any model or external service. Only small display events leave the server
(tool name, file name, first line of a command, and a 120-character prompt preview that only the
debug view shows); file contents and tool output are dropped.

## License

[MIT](LICENSE)
