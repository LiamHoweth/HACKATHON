// Versioned, validated on-device storage for APPROVED items only.
// Cross-tab sync is deliberately disabled: no `storage` event listener.
import type { State, StorageStatus } from '@/core/state';
import { storedDataSchema, type StoredData } from '@/core/schemas';

export const STORAGE_KEY = 'still-here:v1';

export type LoadResult =
  | { status: 'empty'; data: null }
  | { status: 'loaded'; data: StoredData }
  | { status: 'corrupt'; data: null }
  | { status: 'unavailable'; data: null };

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function defaultStorage(): StorageLike | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

export function load(storage: StorageLike | null = defaultStorage()): LoadResult {
  if (!storage) return { status: 'unavailable', data: null };
  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return { status: 'unavailable', data: null };
  }
  if (raw === null) return { status: 'empty', data: null };
  try {
    const parsed = storedDataSchema.safeParse(JSON.parse(raw));
    // Invalid data is reported, never silently deleted.
    return parsed.success ? { status: 'loaded', data: parsed.data } : { status: 'corrupt', data: null };
  } catch {
    return { status: 'corrupt', data: null };
  }
}

export function toStored(state: State): StoredData {
  return {
    version: 1,
    approvedPreferences: state.approvedPreferences,
    approvedProfile: state.approvedProfile,
    savedPhrases: state.savedPhrases.filter((p) => !p.builtIn) as StoredData['savedPhrases'],
    suppressedDimensions: state.suppressedDimensions,
  };
}

export function save(state: State, storage: StorageLike | null = defaultStorage()): boolean {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(toStored(state)));
    return true;
  } catch {
    return false; // quota exceeded, blocked, private mode
  }
}

export function clear(storage: StorageLike | null = defaultStorage()): boolean {
  if (!storage) return false;
  try {
    storage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function loadedAction(result: LoadResult): { type: 'STORAGE_LOADED'; status: StorageStatus; data: StoredData | null } {
  return { type: 'STORAGE_LOADED', status: result.status, data: result.data };
}
