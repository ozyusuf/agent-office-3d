// The palette from docs/DESIGN.md section 2 as numbers for the 3D code. Keep in sync with theme.css.

export const PALETTE = Object.freeze({
  bgVoid: 0x040414,
  bgDeep: 0x040c1c,
  bgNavy: 0x081828,
  surface: 0x0e213b,
  surfaceViolet: 0x1b1b37,
  metal: 0x3c3c3c,
  neonCyan: 0x33b7de,
  neonCyanSoft: 0x4fc3e4,
  neonBlue: 0x2c78b9,
  neonPurple: 0x724bb6,
  neonMagenta: 0xe350a4,
  fireOrange: 0xf1ad56,
  fireDeep: 0xe0662a,
  warnYellow: 0xf4c752,
  okGreen: 0x56d999,
  alertRed: 0xff3b5c,
  text: 0xe6f6ff,
  textDim: 0x8aa4c0,
});

export const DEFAULT_ACCENT = '#33b7de';
const SOFT_WHITE = 0.15; // the measured soft cyan is the cyan with about 15 % white mixed in

/**
 * Accent colour (config `accentColor`, "#rrggbb") -> the two tokens it replaces: `main` for
 * --neon-cyan / neonCyan, `soft` for --neon-cyan-soft / neonCyanSoft. The default gives the
 * measured pair; any other colour gets its soft tone by mixing in white. Invalid -> default.
 * @returns {{ main: number, soft: number, css: { main: string, soft: string } }}
 */
export function accentPair(hex) {
  const valid = typeof hex === 'string' && /^#[0-9a-f]{6}$/i.test(hex);
  const main = valid ? parseInt(hex.slice(1), 16) : PALETTE.neonCyan;
  let soft = PALETTE.neonCyanSoft;
  if (main !== PALETTE.neonCyan) {
    soft = 0;
    for (const shift of [16, 8, 0]) {
      const c = (main >> shift) & 0xff;
      soft |= Math.round(c + (255 - c) * SOFT_WHITE) << shift;
    }
  }
  const css = (n) => `#${n.toString(16).padStart(6, '0')}`;
  return { main, soft, css: { main: css(main), soft: css(soft) } };
}
