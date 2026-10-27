import {useEffect, useState} from 'react';
import type {TypesResponse} from '../../shared/types.ts';
import {loadTypes} from './api.ts';

/** Loads the picker's content type list once. A failure just means no picker; events load independently. */
export function useTypes(): TypesResponse | null {
  const [types, setTypes] = useState<TypesResponse | null>(null);
  useEffect(() => {
    const c = new AbortController();
    loadTypes(c.signal).then(setTypes, () => {});
    return () => c.abort();
  }, []);
  return types;
}

const KEY = 'lattice-calendar:type';

/** The user's last pick, kept per browser. Storage can be unavailable (private mode), so every access is guarded. */
export function readStoredType(): string | undefined {
  try {
    return localStorage.getItem(KEY) || undefined;
  } catch {
    return undefined;
  }
}

export function storeType(slug: string) {
  try {
    localStorage.setItem(KEY, slug);
  } catch {
    /* ignore */
  }
}
