# agent-office-3d

A cyber-RPG style live monitor for [Claude Code](https://code.claude.com). It runs in a narrow
browser window next to your editor and shows what the agent is doing right now: which tool it is
using, which file it is reading or editing, when it waits for your permission, how full the context
is getting and how long the session has been running.

> **Work in progress.** The HUD, the animated 3D scene and the settings panel work (stage 5 of 6).
> A one-step installer is still to come. See [docs/PLAN.md](docs/PLAN.md).

## How it works

```
Claude Code hooks -> local server (127.0.0.1 only) -> WebSocket -> browser page
```

- Claude Code [hooks](https://code.claude.com/docs/en/hooks) run `hooks/send-event.ps1`, which
  forwards each hook event to a small Node.js server on your machine. Hooks run asynchronously and
  stay silent, so they never slow Claude down; if the server is not running they exit quietly.
- The server keeps the session state (current tool, effort, session time, XP) and pushes it to the
  page. Every number on screen comes from a real hook event; the context meter shows the real token
  count of the main agent's context, read from the end of the session transcript.
- The realm floats above a sea of clouds and keeps your local time: dawn, day, sunset, a starry night.
  A station lights up only while the agent works there.

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
- Settings: click the gear icon (top right). Agent name, title, language, accent colour, 3D quality
  and bar scales apply at once in every open tab and are saved to `config.json` (gitignored). The
  port is the only key you set by hand there (see `config.example.json`), then restart the server.
- Tests: `npm test`

## Privacy

Everything stays on your machine. The server listens on 127.0.0.1 only, checks Host/Origin headers
and never calls any model or external service. To show the context size it reads the end of the
session transcript file Claude Code names in each hook event, and keeps only the token count. Only small display events leave the server
(tool name, file name, first line of a command, and a 120-character prompt preview that only the
debug view shows); file contents and tool output are dropped.

## License

[MIT](LICENSE)
