// Settings panel (gear icon, docs/DESIGN.md section 3): every config.json key except the port.
// A change shows at once in this tab (a local draft over the server's config), is saved through
// POST /config, and the server sends the saved config to every open tab (D46). Buttons save at
// once; typing and the colour picker save after a short pause. Nothing is saved that the panel
// has not checked against the same limits as server/config.js.

const SAVE_DELAY_MS = 450;
const SAVED_SHOWN_MS = 2500;
// Same limits as server/config.js (the server checks again).
const LIMITS = { contextBarMax: [10, 100000], sessionBarMinutes: [5, 24 * 60] };

/**
 * @param {{
 *   panel: HTMLElement, button: HTMLElement, status: HTMLElement,
 *   translate: () => (key: string, params?: object) => string,
 *   onChange: (keys: string[], byUser: boolean) => void,
 * }} options  onChange runs whenever the effective config changes (local edit or server)
 */
export function createSettings({ panel, button, status, translate, onChange }) {
  let server = null; // last config from the server
  const draft = {}; // edits not saved yet (or on their way)
  let timer = null;
  let inflight = false;
  let again = false;
  let shownStatus = null; // { kind, text } of the save line
  let statusTimer = null;

  const fields = [...panel.querySelectorAll('[data-key]')];

  // ---- Open / close ----

  function toggle(open) {
    panel.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    if (open) fitHeight();
    else save(); // typed text is saved when the panel closes
  }
  function fitHeight() {
    panel.style.maxHeight = `${Math.max(160, window.innerHeight - panel.getBoundingClientRect().top - 12)}px`;
  }
  button.addEventListener('click', (ev) => {
    ev.stopPropagation();
    toggle(panel.hidden);
  });
  panel.addEventListener('click', (ev) => ev.stopPropagation());
  document.addEventListener('click', () => {
    if (!panel.hidden) toggle(false);
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && !panel.hidden) toggle(false);
  });
  window.addEventListener('resize', () => {
    if (!panel.hidden) fitHeight();
  });

  // ---- Input ----

  function edit(key, value, now) {
    draft[key] = value;
    onChange([key], true);
    clearTimeout(timer);
    if (now) save();
    else timer = setTimeout(save, SAVE_DELAY_MS);
  }

  for (const field of fields) {
    const key = field.dataset.key;
    if (field.tagName === 'INPUT') {
      field.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') save();
      });
    }
    if (field.tagName === 'BUTTON') {
      field.addEventListener('click', () => edit(key, parse(key, field.dataset.value), true));
    } else if (field.type === 'number') {
      field.addEventListener('input', () => {
        const value = Number(field.value);
        const [min, max] = LIMITS[key];
        const ok = field.value !== '' && Number.isInteger(value) && value >= min && value <= max;
        field.setAttribute('aria-invalid', String(!ok));
        if (ok) edit(key, value, false);
        else setStatus('error', translate()('set.range', { min, max }));
      });
      field.addEventListener('change', () => save());
    } else {
      // text and colour: live preview while typing / dragging, saved after a pause or on Enter / blur
      field.addEventListener('input', () => edit(key, field.value, false));
      field.addEventListener('change', () => save());
    }
  }

  // ---- Saving ----

  async function save() {
    clearTimeout(timer);
    timer = null;
    if (inflight) {
      again = true;
      return;
    }
    const patch = { ...draft };
    if (!Object.keys(patch).length) return;
    inflight = true;
    setStatus('saving');
    let result = null;
    try {
      const res = await fetch('/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Agent-Office': '1' },
        body: JSON.stringify(patch),
      });
      const body = await res.json().catch(() => null);
      result = res.ok && body?.ok ? { config: body.config } : { errors: body?.errors ?? [{ key: null, message: `HTTP ${res.status}` }] };
    } catch {
      setStatus('offline'); // the draft stays; it is sent again when the server is back (retry())
    }
    inflight = false;
    if (result) {
      // Saved or refused: either way these values are no longer pending (a newer edit stays).
      for (const [key, value] of Object.entries(patch)) if (draft[key] === value) delete draft[key];
      if (result.config) {
        server = result.config;
        setStatus('saved');
      } else {
        setStatus('error', errorText(result.errors));
      }
      onChange(Object.keys(patch), false);
    }
    if (again) {
      again = false;
      save();
    }
  }

  function errorText(errors) {
    const t = translate();
    const first = errors[0] ?? {};
    return first.key ? t('save.invalid', { field: t(`set.${first.key}`) }) : t('save.failed', { error: first.message ?? '' });
  }

  function setStatus(kind, text) {
    clearTimeout(statusTimer);
    shownStatus = { kind, text };
    if (kind === 'saved') statusTimer = setTimeout(() => setStatus(null), SAVED_SHOWN_MS);
    renderStatus();
  }

  function renderStatus() {
    const t = translate();
    const kind = shownStatus?.kind;
    status.dataset.kind = kind ?? '';
    status.textContent = !kind ? '' : shownStatus.text ?? t(`save.${kind}`);
  }

  return {
    /** Config from the server (hello, or a change saved by any tab). */
    setServer(config) {
      server = config;
      onChange(Object.keys(config), false);
    },
    /** The server's config with this tab's unsaved edits on top; {} before the first hello. */
    effective() {
      return { ...(server ?? {}), ...draft };
    },
    /** After a reconnect: send edits that could not be saved while the server was away. */
    retry() {
      if (Object.keys(draft).length) save();
    },
    /** Shows `shown` (the values this tab uses) in the form; the field being edited is left alone. */
    render(shown) {
      for (const field of fields) {
        const value = shown[field.dataset.key];
        if (field.tagName === 'BUTTON') {
          field.setAttribute('aria-pressed', String(parse(field.dataset.key, field.dataset.value) === value));
        } else if (field !== document.activeElement && value !== undefined) {
          field.value = String(value);
          field.removeAttribute('aria-invalid');
        }
      }
      // The custom colour swatch is "on" when the accent is none of the presets.
      const custom = panel.querySelector('.swatch-custom');
      if (custom) {
        const preset = fields.some((f) => f.dataset.key === 'accentColor' && f.dataset.value === shown.accentColor);
        custom.dataset.on = String(!preset && Boolean(shown.accentColor));
      }
      renderStatus();
    },
    isOpen: () => !panel.hidden,
  };
}

/** A button's data-value as the setting's type. */
function parse(key, value) {
  if (key === 'bloom') return value === 'true';
  if (key === 'pixelRatioCap' || key === 'maxFps') return Number(value);
  if (key === 'contextWindow') return value === 'auto' ? 'auto' : Number(value);
  return value;
}
