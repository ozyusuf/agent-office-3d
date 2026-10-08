// Station labels and the character label: HTML elements in a full-window layer between the 3D canvas
// and the HUD panels. With the 3D scene they follow their station's anchor point every frame, shrink
// with the scene in small windows, and step aside when they would overlap each other. Without the
// scene (no WebGL) they sit at the fixed stage 2 slots inside the HUD's middle area.

const EDGE = 6; // keep labels this far from the window edges
const GAP = 4; // minimum space between two labels
const FULL_SIZE_PPU = 40; // scene scale (CSS px per world unit) at which labels are full size
const MIN_SCALE = 0.7;

export function createLabelLayer(layer, middle) {
  const sizes = new WeakMap(); // element -> cached { w, h } (reset when its text changes)
  const written = new WeakMap(); // element -> last transform written
  let realm = null;

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
    const scale = realm ? Math.min(1, Math.max(MIN_SCALE, realm.pixelsPerUnit() / FULL_SIZE_PPU)) : 1;
    const rect = realm ? null : middle.getBoundingClientRect();
    const items = [];
    for (const el of layer.children) {
      if (el.hidden) continue;
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
      items.push({ el, x: at.x, y: at.y, w: w * scale, h: h * scale, rank: rank(el) });
    }
    items.sort((a, b) => a.rank - b.rank);
    const placed = [];
    for (const item of items) {
      clampX(item);
      stepAside(item, placed);
      placed.push(item);
      write(item, scale);
    }
  }

  function clampX(item) {
    const half = item.w / 2;
    item.x = Math.min(Math.max(item.x, half + EDGE), Math.max(half + EDGE, window.innerWidth - half - EDGE));
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
      clampX(item);
    }
  }

  function write(item, scale) {
    const transform = `translate(${Math.round(item.x)}px, ${Math.round(item.y)}px) translate(-50%, -100%) scale(${scale.toFixed(3)})`;
    if (written.get(item.el) !== transform) {
      item.el.style.transform = transform;
      written.set(item.el, transform);
    }
    item.el.dataset.placed = '';
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
