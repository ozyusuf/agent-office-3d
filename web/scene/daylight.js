// The realm keeps the viewer's local time (D54): dawn glow in the morning, a bright sky over the
// clouds at noon, a warm sunset, moon and stars at night. Pure (no three.js), tested in node.
// Colours are sRGB hex numbers; between two keyframes every value is mixed linearly.

// top / horizon / low: the sky gradient from the top of the window down to below the cloud sea.
// lit / shade: the sunny and the shadow side of the clouds. stars, sun (0 = moon, 1 = sun) and
// day (0 = night light, 1 = noon light) are 0..1; warm tints the key light towards sunrise orange.
const KEYS = [
  { h: 0, top: 0x040818, horizon: 0x0f1c3a, low: 0x050a18, lit: 0x55689a, shade: 0x161f3c, stars: 1, sun: 0, day: 0, warm: 0 },
  { h: 4.5, top: 0x060b20, horizon: 0x1a2146, low: 0x070c1d, lit: 0x5a6390, shade: 0x1b2140, stars: 0.9, sun: 0, day: 0.03, warm: 0 },
  { h: 6, top: 0x1a2a55, horizon: 0xe6a083, low: 0x2a2a4c, lit: 0xf6c6ae, shade: 0x6a5a80, stars: 0.2, sun: 1, day: 0.4, warm: 1 },
  { h: 7.5, top: 0x2a5590, horizon: 0xaccde4, low: 0x5c78a0, lit: 0xfdf7ee, shade: 0x8d9dbd, stars: 0, sun: 1, day: 0.82, warm: 0.3 },
  { h: 12, top: 0x2c65a9, horizon: 0xbfdcf0, low: 0x6c8db6, lit: 0xffffff, shade: 0xa0b2cd, stars: 0, sun: 1, day: 1, warm: 0 },
  { h: 16, top: 0x2b5c9d, horizon: 0xdcd8cc, low: 0x6a85ab, lit: 0xfff5e4, shade: 0xa0a8c2, stars: 0, sun: 1, day: 0.9, warm: 0.25 },
  { h: 18, top: 0x2b2e60, horizon: 0xff9568, low: 0x3c3258, lit: 0xffc39c, shade: 0x7a5878, stars: 0.1, sun: 1, day: 0.45, warm: 1 },
  { h: 19.5, top: 0x10153a, horizon: 0x5b3e70, low: 0x16163a, lit: 0x8c7caa, shade: 0x2d2952, stars: 0.6, sun: 0, day: 0.12, warm: 0.35 },
  { h: 21, top: 0x060a1e, horizon: 0x15204a, low: 0x070c1d, lit: 0x5b6b99, shade: 0x182140, stars: 0.95, sun: 0, day: 0.02, warm: 0 },
  { h: 24, top: 0x040818, horizon: 0x0f1c3a, low: 0x050a18, lit: 0x55689a, shade: 0x161f3c, stars: 1, sun: 0, day: 0, warm: 0 },
];
const COLOURS = ['top', 'horizon', 'low', 'lit', 'shade'];
const NUMBERS = ['stars', 'sun', 'day', 'warm'];

// The sun is up from SUNRISE to SUNSET; the moon the rest of the night.
export const SUNRISE = 6;
export const SUNSET = 19.5;

export function mixHex(a, b, t) {
  let out = 0;
  for (const shift of [16, 8, 0]) {
    const ca = (a >> shift) & 0xff;
    const cb = (b >> shift) & 0xff;
    out |= Math.round(ca + (cb - ca) * t) << shift;
  }
  return out;
}

/** Hour of the day (0..24, fractional) of a Date in local time. */
export function hourOf(date) {
  return date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
}

/** The sky at a local hour (0..24): colours, star/sun/day amounts, and where the sun or moon is. */
export function skyAt(hour) {
  const h = ((hour % 24) + 24) % 24;
  let i = 0;
  while (KEYS[i + 1].h <= h && i < KEYS.length - 2) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const t = (h - a.h) / (b.h - a.h);
  const sky = { hour: h };
  for (const key of COLOURS) sky[key] = mixHex(a[key], b[key], t);
  for (const key of NUMBERS) sky[key] = a[key] + (b[key] - a[key]) * t;
  sky.orbit = orbitAt(h);
  return sky;
}

/**
 * Where the visible body (sun by day, moon by night) is: x from -1 (rising, screen left) to 1
 * (setting, screen right), y from 0 (horizon) to 1 (highest).
 */
export function orbitAt(hour) {
  const h = ((hour % 24) + 24) % 24;
  const day = h >= SUNRISE && h < SUNSET;
  const p = day ? (h - SUNRISE) / (SUNSET - SUNRISE) : (((h - SUNSET) % 24) + 24) % 24 / (24 - SUNSET + SUNRISE);
  return { body: day ? 'sun' : 'moon', x: -1 + 2 * p, y: Math.sin(Math.PI * p) };
}
