/**
 * Saved swings: the analysis and the video, kept in this browser's IndexedDB.
 * Nothing here is ever uploaded.
 */
import type { CameraAngle, SwingAnalysis } from '../core/swing';

export interface SavedSwing {
  id: string;
  at: number;
  angle: CameraAngle;
  analysis: SwingAnalysis;
  starred: boolean;
  note: string;
  /** Club the golfer said they hit, if any. */
  clubId: string | null;
  videoType: string;
  videoBytes: number;
}

const DB = 'caddaie';
const VERSION = 1;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('unsupported'));
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('swings')) db.createObjectStore('swings', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('videos')) db.createObjectStore('videos');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(stores: string[], mode: IDBTransactionMode, run: (t: IDBTransaction) => IDBRequest<T> | void): Promise<T | undefined> {
  return open().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        const t = db.transaction(stores, mode);
        const req = run(t);
        t.oncomplete = () => {
          db.close();
          resolve(req ? req.result : undefined);
        };
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

const isSwing = (v: unknown): v is SavedSwing => {
  const s = v as SavedSwing;
  return !!s && typeof s.id === 'string' && typeof s.at === 'number' && !!s.analysis && s.analysis.ok === true && Array.isArray(s.analysis.metrics);
};

export async function listSwings(): Promise<SavedSwing[]> {
  const all = await tx<unknown[]>(['swings'], 'readonly', (t) => t.objectStore('swings').getAll());
  return (all ?? []).filter(isSwing).sort((a, b) => b.at - a.at);
}

export async function saveSwing(s: SavedSwing, video: Blob | null): Promise<void> {
  await tx(['swings', 'videos'], 'readwrite', (t) => {
    t.objectStore('swings').put(s);
    if (video) t.objectStore('videos').put(video, s.id);
  });
}

export async function updateSwing(s: SavedSwing): Promise<void> {
  await tx(['swings'], 'readwrite', (t) => {
    t.objectStore('swings').put(s);
  });
}

export async function loadVideo(id: string): Promise<Blob | null> {
  const v = await tx<unknown>(['videos'], 'readonly', (t) => t.objectStore('videos').get(id));
  return v instanceof Blob ? v : null;
}

export async function deleteSwing(id: string): Promise<void> {
  await tx(['swings', 'videos'], 'readwrite', (t) => {
    t.objectStore('swings').delete(id);
    t.objectStore('videos').delete(id);
  });
}

export async function clearSwings(): Promise<void> {
  await tx(['swings', 'videos'], 'readwrite', (t) => {
    t.objectStore('swings').clear();
    t.objectStore('videos').clear();
  });
}

/** Ask the browser not to evict our data (honoured for Home Screen apps on iOS). */
export async function requestPersistence(): Promise<boolean | null> {
  try {
    if (!navigator.storage?.persist) return null;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    return e && typeof e.usage === 'number' && typeof e.quota === 'number' ? { usage: e.usage, quota: e.quota } : null;
  } catch {
    return null;
  }
}
