// Realm stations (docs/DESIGN.md section 4) and which one is "active" for the current state.
// `slot` = label position as a fraction of the middle HUD area. These are fixed until stage 3
// projects each label from its 3D station; stations without a slot get a label in stage 3.

export const STATIONS = [
  { key: 'desk' },
  { key: 'smelter', slot: [0.24, 0.52] },
  { key: 'board', slot: [0.7, 0.36] },
  { key: 'centrifuge', slot: [0.76, 0.76] },
  { key: 'orbit' },
  { key: 'racks' },
  { key: 'falls' },
  { key: 'portal' },
  { key: 'arcade' },
];

const BY_KIND = {
  read: 'board', search: 'board', task: 'board',
  edit: 'smelter',
  shell: 'centrifuge',
  web: 'orbit',
  agent: 'portal',
};

/** Set of station keys that should light up for this focus session state. */
export function activeStations(focus) {
  const on = new Set();
  if (!focus || focus.status === 'ended') return on;
  for (const kind of focus.activeKinds) on.add(BY_KIND[kind] ?? 'desk');
  if (focus.helpers.length) on.add('portal');
  if (focus.compacting) on.add('racks');
  if (focus.status === 'idle') on.add('arcade');
  return on;
}
