// What the character does while it stays at one spot. The spot always follows real events
// (director.js); within it the character moves between the spot's stands (walk.js), works there in
// a matching way and fidgets now and then, so it never freezes in place. This is decoration and
// carries no session data. Pure logic (no three.js), so node:test covers it.

/** Director poses during which the character moves between the stands of its spot. */
const ROAMS = new Set(['type', 'stand', 'code', 'present']);
export const roams = (pose) => ROAMS.has(pose);

// Animation for a director pose at a stand, by the stand's act. Anything not listed keeps the pose
// (e.g. 'stand' everywhere, 'play' at the arcade).
const ANIM = {
  type: { keys: 'type', panel: 'swipe', laptop: 'type', free: 'think' },
  code: { keys: 'code', study: 'study', duck: 'duck' },
  present: { board: 'present', study: 'study' },
};

/** The animation for director pose `pose` at a stand whose act is `act`. */
export function animFor(pose, act) {
  return ANIM[pose]?.[act] ?? pose;
}

/**
 * The stand to move to next (index into the spot's stands). From the main stand (0) it goes to
 * one of the others; from any other stand it mostly goes back to the main one, where the work is.
 */
export function nextStand(count, current, rand) {
  if (count < 2) return 0;
  if (current !== 0 && rand() < 0.55) return 0;
  const others = [];
  for (let i = 1; i < count; i++) if (i !== current) others.push(i);
  return others.length ? others[Math.floor(rand() * others.length)] : 0;
}

/** Seconds to stay at a stand before moving on. Work stays longer at the main stand. */
export function dwell(pose, index, rand) {
  if (pose === 'stand') return 4 + rand() * 4;
  return index === 0 ? 3.5 + rand() * 3.5 : 2.2 + rand() * 1.8;
}

// Short gestures that play now and then while the character stands still, by animation.
const FIDGETS = {
  stand: ['look', 'stretch', 'music', 'headphones', 'hop'],
  think: ['look'],
  study: ['look'],
  type: ['look', 'crack'],
  code: ['look', 'crack'],
  play: ['cheer', 'lean'],
};

/** Length of each gesture in seconds (reactions to events included: flinch, ready, cheer). */
export const GESTURE_S = {
  look: 2.2, stretch: 1.9, music: 3.2, headphones: 1.8, hop: 0.8, crack: 1.2, cheer: 1.5, lean: 1.8,
  flinch: 0.9, ready: 0.9,
};

/** A fidget for this animation, or null when it has none. */
export function pickFidget(anim, rand) {
  const list = FIDGETS[anim];
  return list ? list[Math.floor(rand() * list.length)] : null;
}

/** Seconds until the next fidget: often while idle, rarely while working. */
export function fidgetGap(anim, rand) {
  return anim === 'stand' ? 2.5 + rand() * 3.5 : 5 + rand() * 6;
}

/** 0 -> 1 -> 0 over a gesture's progress k (0..1), with soft edges. */
export function envelope(k) {
  const x = Math.max(0, Math.min(1, k / 0.2, (1 - k) / 0.25));
  return x * x * (3 - 2 * x);
}
