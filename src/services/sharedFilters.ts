import { useEffect, useState } from 'react';

/**
 * Filters that mean the same thing on the Overview and the School Report.
 * Narrowing to one school on one screen and finding the other still showing
 * the whole network is the commonest reason to set a scope twice, so these
 * three carry across. Kept for the browser tab only (sessionStorage), and
 * every access is guarded: the screens work without it.
 */
export type SharedFilterKey = 'school' | 'schoolLevel' | 'subjectCategory';

const STORAGE_KEY = 'eduversal_shared_filters_v1';
const ALL = 'All';

type Store = Record<SharedFilterKey, string>;

function read(): Store {
  const fallback: Store = { school: ALL, schoolLevel: ALL, subjectCategory: ALL };
  try {
    const raw = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(STORAGE_KEY) : null;
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

let store: Store = read();
const listeners = new Set<() => void>();

export function getSharedFilter(key: SharedFilterKey): string {
  return store[key];
}

export function setSharedFilter(key: SharedFilterKey, value: string) {
  if (store[key] === value) return;
  store = { ...store, [key]: value };
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Private mode or storage refused: the filter still applies on this screen.
  }
  listeners.forEach((fn) => fn());
}

/** A filter value shared between screens, used like useState. */
export function useSharedFilter(key: SharedFilterKey): [string, (value: string) => void] {
  const [value, setValue] = useState(() => getSharedFilter(key));
  useEffect(() => {
    const sync = () => setValue(getSharedFilter(key));
    listeners.add(sync);
    sync();
    return () => {
      listeners.delete(sync);
    };
  }, [key]);
  return [value, (next: string) => setSharedFilter(key, next)];
}
