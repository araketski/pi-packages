import {
  STATUS_CLEAR_EVENT,
  STATUS_SET_EVENT,
  STATUS_SNAPSHOT_EVENT,
  STATUS_SNAPSHOT_REQUEST_EVENT,
  type StatusColor,
  type StatuslineHost,
  type StatuslineStatus,
} from '@araketski/pi-statusline-protocol';
import { validColorValue } from './config.js';

export interface StatusRegistry {
  readonly statuses: ReadonlyMap<string, StatuslineStatus>;
  requestSnapshot(): void;
  dispose(): void;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function color(value: unknown): value is StatusColor {
  if (validColorValue(value)) return true;
  if (!record(value) || !record(value.byState)) return false;
  if (value.default !== undefined && !validColorValue(value.default)) return false;
  return Object.values(value.byState).every(validColorValue);
}

function status(value: unknown): value is StatuslineStatus {
  return (
    record(value) &&
    typeof value.source === 'string' &&
    value.source.trim().length > 0 &&
    typeof value.key === 'string' &&
    value.key.trim().length > 0 &&
    typeof value.text === 'string' &&
    (value.state === undefined || typeof value.state === 'string') &&
    (value.prefix === undefined || typeof value.prefix === 'string') &&
    (value.color === undefined || color(value.color))
  );
}

export function createStatusRegistry(host: StatuslineHost, onChange: () => void): StatusRegistry {
  const statuses = new Map<string, StatuslineStatus>();
  const touchedSinceRequest = new Set<string>();
  let disposed = false;

  const set = (payload: unknown) => {
    if (disposed || !status(payload)) return;
    touchedSinceRequest.add(payload.key);
    statuses.set(payload.key, { ...payload });
    onChange();
  };
  const clear = (payload: unknown) => {
    if (
      disposed ||
      !record(payload) ||
      typeof payload.source !== 'string' ||
      !payload.source.trim() ||
      typeof payload.key !== 'string' ||
      !payload.key.trim()
    )
      return;
    touchedSinceRequest.add(payload.key);
    if (statuses.get(payload.key)?.source === payload.source) {
      statuses.delete(payload.key);
      onChange();
    }
  };
  const snapshot = (payload: unknown) => {
    if (
      disposed ||
      !record(payload) ||
      typeof payload.source !== 'string' ||
      !Array.isArray(payload.statuses)
    )
      return;
    for (const entry of payload.statuses) {
      if (!status(entry) || entry.source !== payload.source || touchedSinceRequest.has(entry.key))
        continue;
      statuses.set(entry.key, { ...entry });
      onChange();
    }
  };

  const offSet = host.events.on(STATUS_SET_EVENT, set);
  const offClear = host.events.on(STATUS_CLEAR_EVENT, clear);
  const offSnapshot = host.events.on(STATUS_SNAPSHOT_EVENT, snapshot);
  return {
    statuses,
    requestSnapshot() {
      if (disposed) return;
      touchedSinceRequest.clear();
      host.events.emit(STATUS_SNAPSHOT_REQUEST_EVENT, undefined);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      offSet();
      offClear();
      offSnapshot();
      statuses.clear();
    },
  };
}
