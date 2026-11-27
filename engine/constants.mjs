/** Dimensions, zones, time constants, wood coefficients, grades, and storage keys. Y is down. */

export const VIEW_W = 844;
export const VIEW_H = 390;

export const LEFT_X0 = 0;
export const LEFT_X1 = 400;
export const LEFT_Y0 = 44;
export const LEFT_Y1 = 390;

export const RIGHT_X0 = 444;
export const RIGHT_X1 = 844;
export const RIGHT_Y0 = 44;
export const RIGHT_Y1 = 390;
/** After assignment only: play.mjs may keep the right pointer this far past the edge. */
export const RIGHT_EDGE_SLACK = 24;
/** After assignment only: lateral slack around the saw axis. */
export const RIGHT_AXIS_SLACK = 28;

export const BLADE_X = 400;
export const BLADE_Y = 220;

export const GRIP_CX = 188;
export const GRIP_CY = 252;
export const GRIP_VISUAL_R = 124;

/** Rotate weight: 0 at 24, 1 on 40–124, 0 at 156. */
export const ROT_R0 = 24;
export const ROT_R1 = 40;
export const ROT_R2 = 124;
export const ROT_R3 = 156;

export const FEED_DEAD = 16;
export const FEED_RAMP = 64;
export const FEED_FULL = FEED_DEAD + FEED_RAMP;
export const FEED_MAX = 14;
export const FEED_BACK = 0.55;

export const RIGHT_AXIS_X = 648;

export const PLACE_TIME = 1.2;
export const CUT_TIME = 75;
export const FINISH_MIN = 22;
export const FINISH_MIN_TIME = FINISH_MIN;
export const REVEAL_TIME = 1.6;
export const DAILY_LINE_TIME = 2.5;
export const FIXED_DT = 1 / 60;
export const MAX_DT = 0.05;

export const OMEGA_SMOOTH_TAU = 0.12;
export const OMEGA_DECAY_TAU = 0.2;
export const FEED_SMOOTH_TAU = 0.1;
export const FEED_DECAY_TAU = 0.16;
export const OMEGA_MAX = 1.6;

export const TEMPO_WINDOW = 0.8;
export const TEMPO_SMOOTH_TAU = 0.15;
export const TEMPO_DECAY_TAU = 0.2;
export const AMP_SMOOTH_TAU = 0.18;
export const REVERSAL_MIN_Y = 36;
export const TAP_PATH = 10;

export const STROKE_AMP_LO = 36;
export const STROKE_AMP_HI = 96;
export const STROKE_AMP_MID = 56;
export const AMP_BUMP_MID = 56;
export const AMP_BUMP_HALF = 28;
export const TEMPO_MID = 2.6;
export const TEMPO_HALF = 0.9;
export const TEMPO_ZERO_LO = 0.6;
export const TEMPO_KEEP_HI = 4.2;
export const TEMPO_KEEP_VAL = 0.55;

/** Tunable §3 coefficients. DESIGN table: saw cap 12.5, bend grow 1.4, tear 0.68, accuracy 12, cover 6.
 *  Changes stay within ±35%. Start at the table values; bots may retune for gate margin. */
export const SAW_RATE_MAX = 12.5;
export const BEND_GROW = 1.4;
export const BEND_RECOVER = 1.8;
export const TEAR_THRESH = 0.68;
export const ACCURACY_SCALE = 12;
export const COVER_WIDTH = 6;

export const OVERFLOW_APPLY = 0.15;
export const BEND_REF_FEED = 14;
export const TEAR_OFFSET = 8;
export const TEAR_COOLDOWN = 0.8;
export const KERF_MIN_STEP = 0.5;
export const KERF_MAX = 800;
export const MATCH_SAMPLES = 96;
export const DEV_CAP = 18;
export const JAGGED_SCALE = 0.55;

export const PATH_SPACING = 3;
export const PATH_LEN_MIN = 300;
export const PATH_LEN_MAX = 420;
export const BOARD_W = 280;
export const BOARD_H = 210;
export const BOARD_MARGIN = 16;
export const CORNER_R_MIN = 10;
export const CORNER_R_MAX = 26;
export const CORNER_DEG_MIN = 70;
export const CORNER_DEG_MAX = 130;
export const CURVE_MIN = 2;
export const TIGHT_CORNER_R = 28;

export const BEND_CALLOUT = 0.55;
export const BEND_RIDING = 0.2;
export const OFF_LINE = 8;

export const SCORE_EXACT = 88;
export const SCORE_GOOD = 72;
export const SCORE_CLOSE = 55;
export const SCORE_OFF = 32;

export const JUDGE_BALLOON_OFFSET = 70;

export const STORAGE_BEST = "itonoko-sen:bestScore";
export const STORAGE_DAILY_PREFIX = "itonoko-sen:daily:";
export const STORAGE_MUTED = "itonoko-sen:muted";
export const SEED_PREFIX = "itonoko-sen:";

export const WOOD_TABLE = [
  { wood: "soft", sawK: 1.2, bendK: 0.82, tearK: 1.18 },
  { wood: "normal", sawK: 1.0, bendK: 1.0, tearK: 1.0 },
  { wood: "firm", sawK: 0.82, bendK: 1.22, tearK: 0.86 },
];

export const FAMILIES = ["leaf", "wave", "cloud", "key", "recess", "swirl", "bird"];

export const WOOD_LABELS = { soft: "やわらかめ", normal: "ふつう", firm: "硬め" };

export const GRADE_LABELS = {
  exact: "線どおり",
  good: "きれい",
  close: "おしい",
  off: "それた",
  early: "まだ早い",
};

export const GRADE_BALLOONS = {
  exact: "線どおり！",
  good: "きれい",
  close: "おしい",
  off: "それた",
  early: "まだ早い",
};

/** Share line uses the grade as-is; exact gets no extra suffix in the share text itself. */
export const GRADE_SHARE = {
  exact: "線どおり",
  good: "きれい",
  close: "おしい",
  off: "それた",
  early: "まだ早い",
};

export function seedString(dateJst) {
  return SEED_PREFIX + dateJst;
}

export function dailyKey(dateJst) {
  return STORAGE_DAILY_PREFIX + dateJst;
}

export function gradeForScore(score) {
  const s = Number(score) || 0;
  if (s >= SCORE_EXACT) return "exact";
  if (s >= SCORE_GOOD) return "good";
  if (s >= SCORE_CLOSE) return "close";
  if (s >= SCORE_OFF) return "off";
  return "early";
}

export function clamp(x, lo, hi) {
  const n = Number(x);
  if (!Number.isFinite(n)) return lo;
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function foldPi(d) {
  let x = d;
  while (x > Math.PI) x -= 2 * Math.PI;
  while (x < -Math.PI) x += 2 * Math.PI;
  return x;
}

/** Rotate weight around the grip. 0 at 24, 1 on 40–124, 0 at 156. */
export function rotateWeight(r) {
  const x = Number(r) || 0;
  if (x <= ROT_R0 || x >= ROT_R3) return 0;
  if (x < ROT_R1) return (x - ROT_R0) / (ROT_R1 - ROT_R0);
  if (x <= ROT_R2) return 1;
  return (ROT_R3 - x) / (ROT_R3 - ROT_R2);
}

/**
 * 1 when |x-mid| ≤ half, then linear to 0 at mid ± 2*half (floor 0).
 */
export function bump(x, mid, half) {
  const d = Math.abs((Number(x) || 0) - mid);
  if (d <= half) return 1;
  if (d >= 2 * half) return 0;
  return 1 - (d - half) / half;
}

/**
 * Tempo weight: 1 on 1.7–3.5 (mid 2.6, half 0.90), 0 at 0.6, 0.55 at 4.2.
 * Asymmetric on purpose so a slightly fast stroke still has room.
 */
export function tempoWeight(tempo) {
  const t = Number(tempo) || 0;
  const lo = TEMPO_MID - TEMPO_HALF;
  const hi = TEMPO_MID + TEMPO_HALF;
  if (t >= lo && t <= hi) return 1;
  if (t < lo) {
    if (t <= TEMPO_ZERO_LO) return 0;
    return (t - TEMPO_ZERO_LO) / (lo - TEMPO_ZERO_LO);
  }
  const t0 = hi + (TEMPO_KEEP_HI - hi) / (1 - TEMPO_KEEP_VAL);
  if (t >= t0) return 0;
  return 1 - (t - hi) / (t0 - hi);
}

export function feedDesired(y) {
  const fy = GRIP_CY - Number(y);
  if (fy > 0) return FEED_MAX * clamp((fy - FEED_DEAD) / FEED_RAMP, 0, 1);
  if (fy < 0) return -FEED_MAX * FEED_BACK * clamp((-fy - FEED_DEAD) / FEED_RAMP, 0, 1);
  return 0;
}

/** Invert feedDesired for bots: the grip Y that asks for this feed. */
export function yFromFeed(feed) {
  const f = Number(feed) || 0;
  if (f > 0) {
    const t = clamp(f / FEED_MAX, 0, 1);
    return GRIP_CY - (FEED_DEAD + FEED_RAMP * t);
  }
  if (f < 0) {
    const t = clamp(-f / (FEED_MAX * FEED_BACK), 0, 1);
    return GRIP_CY + (FEED_DEAD + FEED_RAMP * t);
  }
  return GRIP_CY;
}
