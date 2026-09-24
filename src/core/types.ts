/**
 * Core CADDAIE domain types.
 *
 * Everything in `src/core` is deterministic and side-effect free: no network,
 * no storage, no randomness, no AI. Internally all distances are yards,
 * heights are feet, wind is mph and temperature is °F. Unit conversion for
 * display happens at the edges (see `units.ts`).
 */

export type ClubType = 'driver' | 'wood' | 'hybrid' | 'iron' | 'wedge';

export interface Club {
  id: string;
  /** Display name, e.g. "7 Iron". */
  name: string;
  /** Short label for chips/buttons, e.g. "7i". */
  short: string;
  type: ClubType;
  /** Stock full-swing carry in yards, measured at the golfer's baseline conditions. */
  carry: number;
  inBag: boolean;
}

export type Lie = 'tee' | 'fairway' | 'first-cut' | 'rough' | 'deep-rough' | 'bunker' | 'hardpan';
export type Stance = 'flat' | 'ball-above' | 'ball-below' | 'uphill' | 'downhill';
export type Trouble = 'short' | 'long' | 'left' | 'right';
export type Handedness = 'right' | 'left';
export type DistanceTendency = 'short' | 'neutral' | 'long';

/**
 * Wind as the golfer experiences it relative to the target line.
 * `fromDeg` is where the wind comes FROM, measured clockwise from the target:
 *   0   = straight into the golfer's face (headwind)
 *   90  = from the right (pushes ball left)
 *   180 = from behind (helping / tailwind)
 *   270 = from the left (pushes ball right)
 */
export interface Wind {
  speedMph: number;
  fromDeg: number;
}

export interface ShotInput {
  /** Yards to the target. `null` means the golfer hasn't told us yet. */
  distance: number | null;
  wind: Wind;
  /** Target height relative to the ball in feet. Positive = uphill. */
  elevationFt: number;
  lie: Lie;
  stance: Stance;
  trouble: Trouble[];
  /** Air temperature °F; `null` = assume the golfer's baseline. */
  temperatureF: number | null;
  /** Course altitude ft above sea level; `null` = assume the golfer's baseline. */
  altitudeFt: number | null;
}

export interface PlayerContext {
  clubs: Club[];
  handedness: Handedness;
  tendency: DistanceTendency;
  /** Conditions the golfer's stock carries were measured in. */
  baseline: { altitudeFt: number; temperatureF: number };
}

export type AdjustmentKind =
  | 'wind'
  | 'elevation'
  | 'temperature'
  | 'altitude'
  | 'lie'
  | 'stance'
  | 'tendency';

export interface Adjustment {
  kind: AdjustmentKind;
  /** Signed yards added to the "plays like" number (positive = plays longer). */
  yards: number;
  /** Short human label, e.g. "12 mph into". */
  label: string;
}

export type SwingType = 'full' | 'smooth' | 'choke-down' | 'knockdown' | 'partial' | 'hard';

export interface Aim {
  /** Signed yards; positive = aim right of the target, negative = left. */
  yards: number;
  reasons: string[];
}

export type Confidence = 'high' | 'medium' | 'low';

export interface Alternative {
  club: Club;
  swing: SwingType;
  note: string;
}

export interface Recommendation {
  status: 'ok';
  input: ShotInput;
  club: Club;
  swing: SwingType;
  /** For partial swings: fraction of a full swing (0–1). */
  swingPct?: number;
  distance: number;
  /** Adjusted yardage the shot should be played as (unrounded engine value). */
  playsLike: number;
  adjustments: Adjustment[];
  aim: Aim;
  alternatives: Alternative[];
  confidence: Confidence;
  /** Deterministic, concise caddie notes (technique, strategy, cautions). */
  notes: string[];
  /** Set when no club can reach: the yards left after the best available shot. */
  leaves?: number;
}

export type InputField = 'distance' | 'wind' | 'elevation' | 'temperature' | 'altitude' | 'clubs';

export interface NeedsInput {
  status: 'needs-input';
  field: InputField;
  /** The smallest useful question to ask the golfer. */
  prompt: string;
}

export interface InvalidInput {
  status: 'invalid';
  field: InputField;
  message: string;
}

export type CaddieResult = Recommendation | NeedsInput | InvalidInput;
