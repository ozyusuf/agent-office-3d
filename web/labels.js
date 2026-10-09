// Station labels and the character label: HTML elements in a full-window layer between the 3D canvas
// and the HUD panels. With the 3D scene they follow their station's anchor point every frame, shrink
// with the scene in small windows, and step aside when they would overlap each other (the step aside
// is eased, so labels glide instead of jumping while the character walks past). Without the scene
// (no WebGL) they sit at the fixed stage 2 slots inside the HUD's middle area.
// With the scene, every label floats a little above its anchor and a thin leader line with a dot
// joins them, like a callout on a technical drawing; when a label steps aside, its leader follows.

const EDGE = 6; // keep labels this far from the window edges
const GAP = 4; // minimum space between two labels
const FULL_SIZE_PPU = 40; // scene scale (CSS px per world unit) at which labels are full size
const MIN_SCALE = 0.7;
const GLIDE_S = 0.12; // time constant of the step-aside easing
const STEM = 16; // leader length at full size: labels float this far above their anchor
const SVG_NS = 'http://www.w3.org/2000/svg';

export function createLabelLayer(layer, middle) {
  const sizes = new WeakMap(); // element -> cached { w, h } (reset when its text changes)
  const written = new WeakMap(); // element -> last transform written
  const offsets = new WeakMap(); // element -> eased { dx, dy } away from its anchor
  let shownLast = new Set(); // labels placed in the previous update
  let lastUpdate = 0;
  let realm = null;
  // The free middle area, measured only when it changes: reading it every frame would force a
  // layout right after the labels moved.
  let rect = middle.getBoundingClientRect();
  const measure = () => { rect = middle.getBoundingClientRect(); };
  new ResizeObserver(measure).observe(middle);
  window.addEventListener('resize', measure);

  // Leader lines live in one SVG under the labels.
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.classList.add('leaders');
  svg.setAttribute('aria-hidden', 'true');
  svg.dataset.placed = '';
  layer.prepend(svg);
  const leaders = new Map(); // label element -> { g, line, dot, drawn }

  function leaderOf(el) {
    let l = leaders.get(el);
    if (!l) {
      const g = document.createElementNS(SVG_NS, 'g');
      g.dataset.station = el.dataset.station ?? el.dataset.anchor;
      const line = document.createElementNS(SVG_NS, 'line');
      const dot = document.createElementNS(SVG_NS, 'circle');
      dot.setAttribute('r', '2');
      g.append(line, dot);
      svg.append(g);
      l = { g, line, dot, drawn: '' };
      leaders.set(el, l);
    }
    return l;
  }

  function drawLeader(item) {
    const l = leaderOf(item.el);
    const ax = Math.round(item.ax);
    const ay = Math.round(item.ay);
    const x = Math.round(item.x);
    const y = Math.round(item.y);
    const key = `${ax},${ay},${x},${y},${item.el.dataset.active}`;
    l.g.style.display = '';
    if (l.drawn === key) return;
    l.drawn = key;
    l.line.setAttribute('x1', ax);
    l.line.setAttribute('y1', ay);
    l.line.setAttribute('x2', x);
    l.line.setAttribute('y2', y);
    l.dot.setAttribute('cx', ax);
    l.dot.setAttribute('cy', ay);
    l.g.dataset.active = item.el.dataset.active ?? 'false';
  }

  function size(el) {
    let s = sizes.get(el);
    if (!s) {
      s = { w: el.offsetWidth, h: el.offsetHeight };
      sizes.set(el, s);
    }
    return s;
  }

  // The character label wins over active stations, active stations over idle ones.
  const rank = (el) => (el.id === 'char-label' ? 0 : el.dataset.active === 'true' ? 1 : 2);

  /** Called after every rendered frame (and on resize when there is no 3D scene). */
  function update() {
    const now = performance.now();
    const glide = 1 - Math.exp(-Math.min(0.1, (now - lastUpdate) / 1000) / GLIDE_S);
    lastUpdate = now;
    const scale = realm ? Math.min(1, Math.max(MIN_SCALE, realm.pixelsPerUnit() / FULL_SIZE_PPU)) : 1;
    // The free middle area: labels stay inside it (the HUD has no boxes to hide them behind).
    area.top = rect.top;
    area.bottom = rect.bottom;
    const items = [];
    const stem = realm ? STEM * scale : 0;
    for (const el of layer.children) {
      if (el.hidden || el === svg) continue;
      let at;
      if (realm) {
        const anchor = realm.anchors[el.dataset.anchor];
        if (!anchor) continue;
        at = realm.project(anchor);
      } else if (el.dataset.slot) {
        const [sx, sy] = el.dataset.slot.split(',').map(Number);
        at = { x: rect.left + sx * rect.width, y: rect.top + sy * rect.height };
      } else {
        continue;
      }
      const { w, h } = size(el);
      // (ax, ay) = the anchor; (hx, hy) = where the label's bottom centre sits when nothing is in the way.
      const hy = at.y - stem;
      items.push({ el, ax: at.x, ay: at.y, hx: at.x, hy, x: at.x, y: hy, w: w * scale, h: h * scale, rank: rank(el) });
    }
    items.sort((a, b) => a.rank - b.rank);
    const placed = [];
    const shown = new Set();
    for (const item of items) {
      clamp(item);
      stepAside(item, placed);
      placed.push(item);
      // Ease the offset from home; a label that just appeared goes straight to its place.
      const dx = item.x - item.hx;
      const dy = item.y - item.hy;
      let off = offsets.get(item.el);
      if (!off || !shownLast.has(item.el)) {
        off = { dx, dy };
        offsets.set(item.el, off);
      } else {
        off.dx += (dx - off.dx) * glide;
        off.dy += (dy - off.dy) * glide;
      }
      item.x = item.hx + off.dx;
      item.y = item.hy + off.dy;
      write(item, scale);
      if (realm) drawLeader(item);
      shown.add(item.el);
    }
    for (const [el, l] of leaders) if (!shown.has(el)) l.g.style.display = 'none';
    shownLast = shown;
  }

  const area = { top: 0, bottom: 0 };
  function clamp(item) {
    const half = item.w / 2;
    item.x = Math.min(Math.max(item.x, half + EDGE), Math.max(half + EDGE, window.innerWidth - half - EDGE));
    const minY = area.top + item.h + 2;
    item.y = Math.min(Math.max(item.y, minY), Math.max(minY, area.bottom - 2));
  }

  // A label's box: centred on x, bottom edge on y (it hangs above its anchor point).
  const box = (it) => ({ left: it.x - it.w / 2, right: it.x + it.w / 2, top: it.y - it.h, bottom: it.y });
  const overlaps = (a, b) =>
    a.left < b.right + GAP && a.right > b.left - GAP && a.top < b.bottom + GAP && a.bottom > b.top - GAP;

  /** Move the label the shortest way out of every label placed before it. */
  function stepAside(item, placed) {
    for (let round = 0; round < 6; round++) {
      const mine = box(item);
      const hit = placed.find((other) => overlaps(mine, box(other)));
      if (!hit) return;
      const other = box(hit);
      const moves = [
        { dx: 0, dy: other.top - GAP - mine.bottom }, // above it
        { dx: 0, dy: other.bottom + GAP - mine.top }, // below it
        { dx: other.left - GAP - mine.right, dy: 0 }, // to its left
        { dx: other.right + GAP - mine.left, dy: 0 }, // to its right
      ];
      const best = moves.reduce((a, b) => (Math.hypot(b.dx, b.dy) < Math.hypot(a.dx, a.dy) ? b : a));
      item.x += best.dx;
      item.y += best.dy;
      clamp(item);
    }
  }

  function write(item, scale) {
    const transform = `translate(${Math.round(item.x)}px, ${Math.round(item.y)}px) translate(-50%, -100%) scale(${scale.toFixed(3)})`;
    if (written.get(item.el) !== transform) {
      item.el.style.transform = transform;
      written.set(item.el, transform);
    }
    if (!('placed' in item.el.dataset)) item.el.dataset.placed = '';
  }

  window.addEventListener('resize', () => realm || update());

  return {
    update,
    /** The 3D scene is ready: labels follow its anchors from now on. */
    attach(r) {
      realm = r;
    },
    /** Call after changing a label's text or visibility. */
    changed(el) {
      sizes.delete(el);
      if (!realm) update();
    },
  };
}
