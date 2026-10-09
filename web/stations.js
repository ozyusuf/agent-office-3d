// Realm stations (docs/DESIGN.md section 4) and which one is "active" for the current state.
// `label`: 'always' = label always shown (the three from the reference image), 'active' = shown
// only while the station is in use, 'never' = no label (the character label covers the desk).
// Labels follow the 3D stations (web/labels.js); `slot` is the fallback position (fraction of the
// HUD's middle area) when the 3D scene is unavailable.

export const STATIONS = [
  { key: 'desk', label: 'never' },
  { key: 'smelter', label: 'always', slot: [0.24, 0.52] },
  { key: 'board', label: 'always', slot: [0.7, 0.36] },
  { key: 'centrifuge', label: 'always', slot: [0.76, 0.76] },
  { key: 'orbit', label: 'active' },
  { key: 'racks', label: 'active' },
  { key: 'falls', label: 'never' },
  { key: 'portal', label: 'active' },
  { key: 'arcade', label: 'active' },
];

const BY_KIND = {
  read: 'board', search: 'board', task: 'board',
  edit: 'smelter',
  shell: 'centrifuge',
  web: 'orbit',
  agent: 'portal',
};

/** Station that works on a tool kind (anything unknown is handled at the desk). */
export function stationForKind(kind) {
  return BY_KIND[kind] ?? 'desk';
}

/** Set of station keys that should light up for this focus session state. */
export function activeStations(focus) {
  const on = new Set();
  if (!focus || focus.status === 'ended') return on;
  for (const kind of focus.activeKinds) on.add(stationForKind(kind));
  if (focus.helpers.length) on.add('portal');
  if (focus.compacting) on.add('racks');
  // The agent plays at the arcade after a finished turn; a fresh session waits at the desk.
  if (focus.status === 'idle' && focus.turnEnded) on.add('arcade');
  return on;
}
