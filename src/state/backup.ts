/**
 * Backup and restore. CADDAIE has no account and no server copy of your data,
 * so a file you keep is the way to move to a new phone or survive a cleared browser.
 * Videos are not included (they stay in this browser); swing analyses are.
 */
import type { SavedSwing } from './swings';
import { sanitizeGolf, type GolfData } from './golf';
import { sanitizeProfile, type Profile } from './profile';

export const BACKUP_FORMAT = 'caddaie-backup';

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: 1;
  exportedAt: number;
  profile: Profile;
  golf: GolfData;
  swings: Omit<SavedSwing, 'videoBytes'>[];
}

export function buildBackup(profile: Profile, golf: GolfData, swings: SavedSwing[], now = Date.now()): Backup {
  return { format: BACKUP_FORMAT, version: 1, exportedAt: now, profile, golf, swings: swings.map(({ videoBytes: _v, ...s }) => s) };
}

export type RestoreResult = { ok: true; profile: Profile; golf: GolfData; swings: SavedSwing[] } | { ok: false; reason: string };

export function parseBackup(text: string): RestoreResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'That file isn’t a CADDAIE backup.' };
  }
  const b = raw as Partial<Backup>;
  if (!b || b.format !== BACKUP_FORMAT) return { ok: false, reason: 'That file isn’t a CADDAIE backup.' };
  const golf = sanitizeGolf((b.golf ?? {}) as Record<string, unknown>);
  const swings = (Array.isArray(b.swings) ? b.swings : [])
    .filter((s) => s && typeof s.id === 'string' && s.analysis?.ok === true && Array.isArray(s.analysis.metrics))
    .map((s) => ({ ...s, videoBytes: 0 }) as SavedSwing);
  return { ok: true, profile: sanitizeProfile(b.profile), golf, swings };
}
