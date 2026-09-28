import { stripVTControlCharacters } from 'node:util';

export const STATUS_SET_EVENT = 'pi-statusline:status:set';
export const STATUS_CLEAR_EVENT = 'pi-statusline:status:clear';
export const STATUS_SNAPSHOT_REQUEST_EVENT = 'pi-statusline:status:snapshot-request';
export const STATUS_SNAPSHOT_EVENT = 'pi-statusline:status:snapshot';

export interface StatuslineStatus {
  source: string;
  key: string;
  text: string;
  state?: string;
  icon?: string;
  color?: string;
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

export interface StatusRegistration {
  source: string;
  key: string;
  icon?: string;
  color?: string;
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

/** Register one session-scoped producer; ANSI styling is removed from its icon and text. */
export function registerStatus(
  host: StatuslineHost,
  ui: StatuslineUI,
  defaults: StatusRegistration,
): StatusHandle {
  if (!defaults.source.trim() || !defaults.key.trim()) {
    throw new Error('Status source and key must be nonempty');
  }
  const { source, key, color } = defaults;
  const icon = defaults.icon === undefined ? undefined : stripVTControlCharacters(defaults.icon);
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
      current = { source, key, text: stripVTControlCharacters(text), state, icon, color };
      const fallback = icon ? `${icon} ${current.text}` : current.text;
      ui.setStatus(key, color ? ui.theme.fg(color, fallback) : fallback);
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
