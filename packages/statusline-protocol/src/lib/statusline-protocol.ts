import { stripVTControlCharacters } from 'node:util';

export const STATUS_SET_EVENT = 'pi-statusline:status:set';
export const STATUS_CLEAR_EVENT = 'pi-statusline:status:clear';
export const STATUS_SNAPSHOT_REQUEST_EVENT = 'pi-statusline:status:snapshot-request';
export const STATUS_SNAPSHOT_EVENT = 'pi-statusline:status:snapshot';

export type StatusColorValue = string | number;
export type StatusColor =
  | StatusColorValue
  | { default: StatusColorValue; byState: Record<string, StatusColorValue> };

/** Shared appearance contract for producer defaults and per-key footer configuration. */
export interface StatusAppearance {
  prefix?: string;
  color?: StatusColor;
}

export interface StatuslineStatus extends StatusAppearance {
  source: string;
  key: string;
  text: string;
  state?: string;
}

export interface StatuslineHost {
  events: {
    emit(name: string, payload: unknown): void;
    on(name: string, handler: (payload: unknown) => void): () => void;
  };
}

export interface StatuslineUI {
  setStatus(key: string, text: string | undefined): void;
  theme: { fg(color: string, text: string): string };
}

export interface StatusRegistration extends StatusAppearance {
  source: string;
  key: string;
}

export interface StatusUpdate {
  text: string;
  state?: string;
}

export interface StatusHandle {
  update(value: StatusUpdate): void;
  clear(): void;
  dispose(): void;
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function validateColorValue(value: StatusColorValue): void {
  if (typeof value === 'number') {
    if (Number.isInteger(value) && value >= 0 && value <= 255) return;
  } else if (!value.startsWith('#') || HEX_COLOR.test(value)) {
    return;
  }
  throw new Error(`Invalid status color: ${String(value)}`);
}

function validateColor(color: StatusColor | undefined): void {
  if (color === undefined) return;
  if (typeof color === 'string' || typeof color === 'number') {
    validateColorValue(color);
    return;
  }
  validateColorValue(color.default);
  for (const value of Object.values(color.byState)) validateColorValue(value);
}

function resolveColor(
  color: StatusColor | undefined,
  state: string | undefined,
): StatusColorValue | undefined {
  if (typeof color !== 'object' || color === null) return color;
  return state !== undefined && Object.hasOwn(color.byState, state)
    ? color.byState[state]
    : color.default;
}

function renderColor(color: StatusColorValue | undefined, text: string, ui: StatuslineUI): string {
  if (color === undefined || color === '') return text;
  if (typeof color === 'number') return `\u001b[38;5;${color}m${text}\u001b[0m`;
  if (color.startsWith('#')) {
    const r = Number.parseInt(color.slice(1, 3), 16);
    const g = Number.parseInt(color.slice(3, 5), 16);
    const b = Number.parseInt(color.slice(5, 7), 16);
    return `\u001b[38;2;${r};${g};${b}m${text}\u001b[0m`;
  }
  return ui.theme.fg(color, text);
}

/** Register one session-scoped producer; ANSI styling is removed from its prefix and text. */
export function registerStatus(
  host: StatuslineHost,
  ui: StatuslineUI,
  defaults: StatusRegistration,
): StatusHandle {
  if (!defaults.source.trim() || !defaults.key.trim()) {
    throw new Error('Status source and key must be nonempty');
  }
  const { source, key, color } = defaults;
  validateColor(color);
  const prefix =
    defaults.prefix === undefined ? undefined : stripVTControlCharacters(defaults.prefix);
  let current: StatuslineStatus | undefined;
  let disposed = false;
  const off = host.events.on(STATUS_SNAPSHOT_REQUEST_EVENT, () => {
    host.events.emit(STATUS_SNAPSHOT_EVENT, {
      source,
      statuses: current ? [{ ...current }] : [],
    });
  });

  const clear = () => {
    if (disposed || !current) return;
    current = undefined;
    ui.setStatus(key, undefined);
    host.events.emit(STATUS_CLEAR_EVENT, { source, key });
  };

  return {
    update({ text, state }) {
      if (disposed) return;
      current = { source, key, text: stripVTControlCharacters(text), state, prefix, color };
      const fallback = prefix ? `${prefix} ${current.text}` : current.text;
      const selectedColor = resolveColor(color, state);
      ui.setStatus(key, renderColor(selectedColor, fallback, ui));
      host.events.emit(STATUS_SET_EVENT, { ...current });
    },
    clear,
    dispose() {
      if (disposed) return;
      clear();
      disposed = true;
      off();
    },
  };
}
