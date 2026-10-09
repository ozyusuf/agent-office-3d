// Where the character can walk: a ring around the command desk's dais plus one leg from the ring
// out to each work spot, and at each spot a few stands it moves between while it stays there
// (life.js). Plain numbers (no three.js), so node:test covers it.
// World axes as in world.js: +x runs to the lower right of the screen, +z to the lower left, y is up.
// The spots follow the station positions in props.js; angles are atan2(z, x) around the desk.

const DEG = Math.PI / 180;
/** Facing the camera (the camera looks from +x +z). */
export const YAW_CAMERA = Math.PI / 4;
/** Ring radius: outside the desk console (r 1.65), still on the dais (r 2.5). */
export const RING_R = 2.15;
// The ring is never walked behind the console (around this angle), where the board's posts stand
// and the console would hide the character; every arc goes round the front instead.
const BACK = -135 * DEG;

/** Station frames as built in props.js: position [x, z] and turn (rotation.y). */
export const FRAMES = {
  desk: [0, 0, YAW_CAMERA],
  editor: [-2.55, 2.95, YAW_CAMERA + 0.35], // EDITOR_POS / EDITOR_YAW
  board: [0.5, -3.8, YAW_CAMERA],
};

/** World [x, z] of a point given in a station's own frame (its local +z is its front). */
export function inFrame(key, lx, lz) {
  const [x, z, turn] = FRAMES[key];
  return [x + lx * Math.cos(turn) + lz * Math.sin(turn), z - lx * Math.sin(turn) + lz * Math.cos(turn)];
}

/** Yaw (0 = facing +z) of a character in a station's frame looking from [lx, lz] at [tx, tz]. */
function facing(key, [lx, lz], [tx, tz]) {
  return Math.atan2(tx - lx, tz - lz) + FRAMES[key][2];
}

/**
 * A stand: where the character stands (`at`, world [x, z]), which way it faces (`yaw`) and what it
 * does there (`act`, see life.js), built from the station's own frame.
 */
function stand(key, act, local, lookAt) {
  return { at: inFrame(key, ...local), yaw: facing(key, local, lookAt), act };
}

// Desk: everything stays inside the ring console (inner radius 1.2; the body is ~0.5 wide).
const DESK_STANDS = [
  { at: [-0.15, -0.15], yaw: YAW_CAMERA, act: 'keys' }, // at the holo keyboard, facing the camera
  stand('desk', 'panel', [0.48, 0.12], [1.14, 0.9]), // the holo panel at screen right
  stand('desk', 'panel', [-0.48, 0.12], [-1.14, 0.9]), // the holo panel at screen left
  stand('desk', 'laptop', [-0.42, -0.3], [-1.35, 0.45]),
  { at: inFrame('desk', 0.15, -0.5), yaw: YAW_CAMERA + 0.2, act: 'free' },
];
// Editor: in front of the bench; it types at the right end (the monitor stays visible).
const EDITOR_STANDS = [
  stand('editor', 'keys', [0.75, 0.9], [0.5, -0.1]),
  stand('editor', 'study', [0.85, 1.35], [-0.2, -0.2]), // a step back (right of the monitor), studying it
  stand('editor', 'duck', [-0.3, 0.98], [-0.78, 0.12]), // explaining it to the rubber duck
];
// Board: in front of it, presenting to the camera, or a step back studying it.
const BOARD_STANDS = [
  { at: [2.16, -3.13], yaw: 0.29, act: 'board' },
  { at: inFrame('board', -0.2, 1.95), yaw: 0.29, act: 'board' },
  stand('board', 'study', [0.3, 2.15], [0, 0.3]),
];

/**
 * Work spots. `phi`: where the leg leaves the ring; `points`: the leg from the ring out to the
 * spot (last point = the first stand); `yaw`: which way the character faces there (0 = +z);
 * `stands`: where it moves while it stays (the first one is the spot itself).
 */
export const SPOTS = {
  // inside the ring console, through its opening towards the camera
  desk: { phi: 45 * DEG, points: [DESK_STANDS[0].at], yaw: YAW_CAMERA, stands: DESK_STANDS },
  // in front of the bench's right end, facing the monitor half side-on
  editor: legTo(EDITOR_STANDS),
  // in front of the holo board's right half, half turned to it
  board: { phi: -55 * DEG, points: [BOARD_STANDS[0].at], yaw: 0.29, stands: BOARD_STANDS },
  // over the step onto the west platform, in front of the cabinet
  arcade: {
    phi: 160 * DEG, points: [[-3.4, 1.4], [-4.6, 1.85], [-5.6, 1.9], [-6.2, 1.95]], yaw: -1.25,
    stands: [{ at: [-6.2, 1.95], yaw: -1.25, act: 'arcade' }],
  },
};

/** A straight leg from the ring out to the first stand. */
function legTo(stands) {
  const [x, z] = stands[0].at;
  return { phi: Math.atan2(z, x), points: [stands[0].at], yaw: stands[0].yaw, stands };
}

/** Floor height under a point: dais, main platform, the step and the west platform. */
export function floorAt(x, z) {
  if (Math.hypot(x, z) < 2.5) return 0.2;
  if (x < -5.25) return 0.35;
  if (x < -4.75) return 0.175;
  return 0;
}

/** Angle on the ring, in (BACK, BACK + 360°], so arcs between two angles never cross the back. */
function ringAngle(phi) {
  let a = phi;
  while (a <= BACK) a += 2 * Math.PI;
  while (a > BACK + 2 * Math.PI) a -= 2 * Math.PI;
  return a;
}

const ringPoint = (phi) => [RING_R * Math.cos(phi), RING_R * Math.sin(phi)];

/** A leg as a polyline from its ring point to its spot. */
function legLine(key) {
  const spot = SPOTS[key];
  return [ringPoint(spot.phi), ...spot.points];
}

function closestOnSegment([px, pz], [ax, az], [bx, bz]) {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  const u = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2)) : 0;
  const cx = ax + u * dx;
  const cz = az + u * dz;
  return { u, d: Math.hypot(px - cx, pz - cz) };
}

/** Where on the walk network a point is: on a leg (segment index) or on the ring (angle). */
function locate(p) {
  let best = { ring: true, phi: Math.atan2(p[1], p[0]), d: Math.abs(Math.hypot(p[0], p[1]) - RING_R) };
  for (const key of Object.keys(SPOTS)) {
    const line = legLine(key);
    for (let i = 0; i < line.length - 1; i++) {
      const { u, d } = closestOnSegment(p, line[i], line[i + 1]);
      if (d < best.d - 1e-9) best = { leg: key, seg: i, u, d };
    }
  }
  return best;
}

/** Points along the ring from one angle to another, about every 15°. */
function arc(from, to) {
  const a = ringAngle(from);
  const b = ringAngle(to);
  const steps = Math.max(1, Math.ceil(Math.abs(b - a) / (15 * DEG)));
  const pts = [];
  for (let i = 1; i <= steps; i++) pts.push(ringPoint(a + ((b - a) * i) / steps));
  return pts;
}

/**
 * Waypoints [[x, z], ...] from point `from` to spot `to` (the last waypoint is the spot).
 * Off the ring the character only moves along legs, so it never walks through the console,
 * the editor bench or the board.
 */
export function planPath(from, to) {
  const goal = legLine(to);
  const here = locate(from);
  if (here.leg === to) return goal.slice(here.seg + 1); // already on the right leg: walk out to its end
  const out = [];
  let phi = here.phi;
  if (here.leg) {
    // Walk back along the current leg to the ring.
    const line = legLine(here.leg);
    for (let i = here.u > 0 ? here.seg : here.seg - 1; i >= 0; i--) out.push(line[i]);
    phi = SPOTS[here.leg].phi;
  }
  out.push(...arc(phi, SPOTS[to].phi), ...goal.slice(1));
  return out;
}

/** Length of a walk through the given points, starting at `from`. */
export function pathLength(from, points) {
  let len = 0;
  let prev = from;
  for (const p of points) {
    len += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    prev = p;
  }
  return len;
}

/** The spot's own position [x, z]. */
export const spotPoint = (key) => SPOTS[key].points.at(-1);
