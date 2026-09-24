import type { Club, ClubType, Lie } from './types';

/**
 * A typical mid-handicap bag. Good enough to be useful on first launch;
 * the golfer edits carries in Settings to make CADDAIE meaningfully better.
 */
export const DEFAULT_CLUBS: readonly Club[] = [
  { id: 'dr', name: 'Driver', short: 'Dr', type: 'driver', carry: 230, inBag: true },
  { id: '3w', name: '3 Wood', short: '3W', type: 'wood', carry: 210, inBag: true },
  { id: '5w', name: '5 Wood', short: '5W', type: 'wood', carry: 195, inBag: true },
  { id: '4h', name: '4 Hybrid', short: '4H', type: 'hybrid', carry: 185, inBag: true },
  { id: '4i', name: '4 Iron', short: '4i', type: 'iron', carry: 180, inBag: false },
  { id: '5i', name: '5 Iron', short: '5i', type: 'iron', carry: 172, inBag: true },
  { id: '6i', name: '6 Iron', short: '6i', type: 'iron', carry: 162, inBag: true },
  { id: '7i', name: '7 Iron', short: '7i', type: 'iron', carry: 152, inBag: true },
  { id: '8i', name: '8 Iron', short: '8i', type: 'iron', carry: 141, inBag: true },
  { id: '9i', name: '9 Iron', short: '9i', type: 'iron', carry: 130, inBag: true },
  { id: 'pw', name: 'Pitching Wedge', short: 'PW', type: 'wedge', carry: 118, inBag: true },
  { id: 'gw', name: 'Gap Wedge', short: 'GW', type: 'wedge', carry: 105, inBag: true },
  { id: 'sw', name: 'Sand Wedge', short: 'SW', type: 'wedge', carry: 90, inBag: true },
  { id: 'lw', name: 'Lob Wedge', short: 'LW', type: 'wedge', carry: 75, inBag: true },
];

/** How much carry a golfer can reliably take off a club with a smoother / shorter swing. */
export const MAX_TAKEOFF_PCT: Record<ClubType, number> = {
  driver: 0.05,
  wood: 0.06,
  hybrid: 0.07,
  iron: 0.08,
  wedge: 0.12,
};

/** Clubs that make no sense from a given lie. */
export function clubAllowedFromLie(club: Club, lie: Lie): boolean {
  if (club.type === 'driver') return lie === 'tee';
  if (lie === 'deep-rough') return club.type === 'wedge' || (club.type === 'iron' && club.carry <= 165) || club.type === 'hybrid';
  if (lie === 'bunker') return club.type !== 'wood';
  return true;
}

/** Clubs usable for this shot, longest first. */
export function eligibleClubs(clubs: readonly Club[], lie: Lie): Club[] {
  return clubs
    .filter((c) => c.inBag && Number.isFinite(c.carry) && c.carry > 0 && clubAllowedFromLie(c, lie))
    .sort((a, b) => b.carry - a.carry);
}

export interface GapIssue {
  longer: Club;
  shorter: Club;
  gap: number;
}

/** Flags distance gaps worth telling the golfer about in Settings (overlaps or holes in the bag). */
export function findGapIssues(clubs: readonly Club[]): GapIssue[] {
  const bag = clubs.filter((c) => c.inBag).sort((a, b) => b.carry - a.carry);
  const issues: GapIssue[] = [];
  for (let i = 0; i < bag.length - 1; i++) {
    const gap = bag[i].carry - bag[i + 1].carry;
    if (gap < 4 || gap > 25) issues.push({ longer: bag[i], shorter: bag[i + 1], gap });
  }
  return issues;
}
