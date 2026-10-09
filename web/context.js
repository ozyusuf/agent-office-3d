// How full the main agent's context is (D55), for the HUD meter and the rack LEDs alike.
// Real tokens when the server could read them from the session transcript; otherwise the stage 2
// fallback: tool calls since the last compaction over `contextBarMax`.

export const WINDOWS = [200_000, 1_000_000]; // Claude context window sizes

/** Window the bar fills up to: the setting, or auto = 200k, or 1M once more than 200k is in use. */
export function windowFor(tokens, setting = 'auto') {
  if (Number.isFinite(setting) && setting > 0) return setting;
  return tokens > WINDOWS[0] ? WINDOWS[1] : WINDOWS[0];
}

/** 0..1, or 0 when nothing is known. */
export function contextFill(focus, config = {}) {
  if (!focus) return 0;
  if (Number.isFinite(focus.tokens)) return Math.min(1, focus.tokens / windowFor(focus.tokens, config.contextWindow));
  const max = config.contextBarMax > 0 ? config.contextBarMax : 150;
  return Math.min(1, focus.context / max);
}

/** 1234 -> "1.2k", 505000 -> "505k", 1000000 -> "1M". */
export function formatTokens(n) {
  if (n >= 1e6) return `${trim(n / 1e6)}M`;
  if (n >= 1e3) return `${n >= 1e5 ? Math.round(n / 1e3) : trim(n / 1e3)}k`;
  return String(n);
}

function trim(x) {
  return (Math.round(x * 10) / 10).toString();
}
