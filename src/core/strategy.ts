/**
 * Caddie strategy: where to aim, the safe miss and how to play a hole.
 * Deterministic rules built only on what HitWhat actually knows: the pin
 * position and trouble the golfer marked, their bag, their handicap estimate
 * and their recorded tendencies.
 */
import type { Club, Trouble } from './types';

export type PinDepth = 'front' | 'middle' | 'back';
export type PinSide = 'left' | 'center' | 'right';
export interface PinPosition {
  depth: PinDepth;
  side: PinSide;
}

export function pinText(p: PinPosition): string {
  if (p.depth === 'middle' && p.side === 'center') return 'Middle';
  if (p.side === 'center') return p.depth === 'front' ? 'Front' : p.depth === 'back' ? 'Back' : 'Middle';
  const depth = p.depth === 'middle' ? '' : `${p.depth === 'front' ? 'Front' : 'Back'}-`;
  return `${depth}${depth ? p.side : p.side[0].toUpperCase() + p.side.slice(1)}`;
}

export interface TargetAdvice {
  /** Short line: "Favor the middle." */
  aim: string;
  /** Why, in one sentence. */
  why: string | null;
  /** Null when the golfer hasn't marked trouble or a pin: there's nothing to base it on. */
  safeMiss: string | null;
}

/**
 * Where to aim on the green. Golfers above single digits gain strokes by
 * aiming at the fat part of the green when the pin is tucked; trouble on the
 * pin side makes that a must for everyone.
 */
export function targetAdvice(opts: { pin: PinPosition | null; trouble: Trouble[]; handicap: number | null; clubCarry: number }): TargetAdvice {
  const { pin, trouble, handicap, clubCarry } = opts;
  const scoringClub = clubCarry <= 140;
  const skilled = handicap !== null && handicap <= 9;
  const left = trouble.includes('left');
  const right = trouble.includes('right');
  const short = trouble.includes('short');
  const long = trouble.includes('long');

  let aim = 'Aim at the flag.';
  let why: string | null = null;
  if (pin) {
    const tucked = pin.side !== 'center';
    const pinSideTrouble = (pin.side === 'left' && left) || (pin.side === 'right' && right);
    const label = pinText(pin).toLowerCase();
    if (pinSideTrouble) {
      aim = `Favor the ${pin.side === 'left' ? 'right' : 'left'} side of the green.`;
      why = `Pin is ${label} with trouble on that side. Missing there short-sides you.`;
    } else if (tucked && !(skilled && scoringClub)) {
      aim = 'Favor the middle.';
      why = `Pin is ${label}. The middle of the green takes the big miss out of play.`;
    } else if (pin.depth === 'back' && long) {
      aim = 'Play to the middle.';
      why = 'Back pin with trouble long. Below the hole is the place to be.';
    } else if (pin.depth === 'front' && short) {
      aim = 'Take enough to reach the middle.';
      why = 'Front pin with trouble short. Coming up short is the costly miss.';
    } else if (tucked) {
      aim = `Go at it. Shade it toward the ${pin.side === 'left' ? 'right' : 'left'}.`;
      why = `Pin is ${label}, and this is a scoring club for you.`;
    }
  }
  return { aim, why, safeMiss: safeMiss(trouble, pin) };
}

export function safeMiss(trouble: Trouble[], pin: PinPosition | null): string | null {
  if (!trouble.length && !pin) return null;
  const left = trouble.includes('left');
  const right = trouble.includes('right');
  const short = trouble.includes('short');
  const long = trouble.includes('long');
  const sides: string[] = [];
  if (!short && !long) sides.push(pin?.depth === 'back' ? 'short' : pin?.depth === 'front' ? 'long' : 'short');
  else if (short && !long) sides.push('long');
  else if (long && !short) sides.push('short');
  if (left && !right) sides.push('right');
  else if (right && !left) sides.push('left');
  else if (!left && !right && pin && pin.side !== 'center') sides.push(pin.side === 'left' ? 'right' : 'left');
  if (!sides.length) return 'No safe miss. Middle of the green only.';
  return `Safest miss: ${sides.join(' and ')}.`;
}

export interface HolePlanInput {
  par: number;
  yards: number | null;
  /** Clubs in the bag with the carries the caddie should use, longest first not required. */
  clubs: Club[];
  /** Average measured driver distance (with roll), if the golfer has tracked drives. */
  driveTotal: number | null;
  /** Fairway misses recorded across rounds. */
  misses: { left: number; right: number; hit: number };
  /** The golfer's previous scores on this hole of this course. */
  history: number[];
}

export interface HolePlan {
  teeClub: Club | null;
  /** What the tee shot leaves, in yards, when the hole length is known. */
  leaves: number | null;
  lines: string[];
}

/** Typical roll after carry for a driver on an average fairway. Shown as approximate. */
const DRIVER_ROLL = 1.08;

export function holePlan(input: HolePlanInput): HolePlan {
  const bag = input.clubs.filter((c) => c.inBag && c.carry > 0).sort((a, b) => b.carry - a.carry);
  const lines: string[] = [];
  let teeClub: Club | null = null;
  let leaves: number | null = null;
  const y = input.yards;

  if (bag.length && y !== null) {
    if (input.par <= 3) {
      teeClub = bag.slice().reverse().find((c) => c.carry >= y - 3) ?? bag[0];
      lines.push(`${teeClub.name} carries ${Math.round(teeClub.carry)}. Check the pin and wind in Caddie before you hit.`);
    } else {
      const driver = bag.find((c) => c.type === 'driver') ?? bag[0];
      const driveTotal = input.driveTotal ?? driver.carry * DRIVER_ROLL;
      const wedges = bag.filter((c) => c.type === 'wedge');
      const favourite = wedges[0] ?? bag[bag.length - 1];
      if (input.par === 4) {
        const left = y - driveTotal;
        if (left < favourite.carry * 0.6 && bag.length > 1) {
          // Leave a full wedge instead of an awkward half shot.
          const want = y - favourite.carry;
          const layup = bag.find((c) => c.carry * (c.type === 'driver' || c.type === 'wood' ? DRIVER_ROLL : 1.03) <= want + 5) ?? driver;
          teeClub = layup;
          leaves = Math.max(0, Math.round(y - layup.carry * (layup.type === 'driver' || layup.type === 'wood' ? DRIVER_ROLL : 1.03)));
          lines.push(`${layup.name} off the tee leaves about ${leaves}, a full ${favourite.name}. Better than a half-wedge.`);
        } else {
          teeClub = driver;
          leaves = Math.max(0, Math.round(left));
          const approach = bag.slice().reverse().find((c) => c.carry >= leaves! - 3);
          lines.push(
            approach
              ? `${driver.name} leaves about ${leaves}: ${/^[aeiou8]/i.test(approach.name) ? 'an' : 'a'} ${approach.name} in.`
              : `${driver.name} leaves about ${leaves}.`,
          );
        }
      } else {
        teeClub = driver;
        const afterTee = y - driveTotal;
        const second = bag.find((c) => c.type !== 'driver') ?? driver;
        if (afterTee <= second.carry + 10) {
          leaves = Math.max(0, Math.round(afterTee));
          lines.push(`Reachable in two: about ${leaves} left after a good drive. Only go for it from a good lie.`);
        } else {
          const lay = Math.round(afterTee - favourite.carry);
          leaves = Math.round(favourite.carry);
          lines.push(`Three-shot hole for you. Lay up about ${lay} to leave a full ${favourite.name} (${leaves}).`);
        }
      }
      if (input.driveTotal === null && teeClub.type === 'driver') lines.push('Drive length is estimated from your carry. Track a few drives to make it yours.');
    }
  }

  const misses = input.misses.left + input.misses.right;
  if (input.par >= 4 && misses >= 5) {
    const right = input.misses.right / misses;
    if (right >= 0.65) lines.push(`${input.misses.right} of your last ${misses} missed fairways went right. Start it down the left half.`);
    else if (right <= 0.35) lines.push(`${input.misses.left} of your last ${misses} missed fairways went left. Start it down the right half.`);
  }
  if (input.history.length >= 2) {
    const avg = input.history.reduce((a, b) => a + b, 0) / input.history.length;
    lines.push(`You average ${avg.toFixed(1)} here over ${input.history.length} rounds.`);
  }
  if (!lines.length) lines.push(y === null ? 'Add this hole’s yardage to the course for a tee-shot plan.' : 'Add clubs to your bag for a tee-shot plan.');
  return { teeClub, leaves, lines };
}
