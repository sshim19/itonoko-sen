/** Positions → tempo, amp, strokeQ, sawRate. Checkable pure functions. */

import {
  AMP_BUMP_HALF,
  AMP_BUMP_MID,
  AMP_SMOOTH_TAU,
  REVERSAL_MIN_Y,
  SAW_RATE_MAX,
  STROKE_AMP_HI,
  STROKE_AMP_LO,
  STROKE_AMP_MID,
  TAP_PATH,
  TEMPO_DECAY_TAU,
  TEMPO_SMOOTH_TAU,
  TEMPO_WINDOW,
  bump,
  clamp,
  tempoWeight,
} from "./constants.mjs";

export { bump, tempoWeight } from "./constants.mjs";

const MAX_EVENTS = 24;

export function emptyRight() {
  return {
    prevY: null,
    prevX: null,
    prevDir: null,
    tempo: 0,
    amp: 0,
    strokeQ: 0,
    sawRate: 0,
    clock: 0,
    sawStart: null,
    contactPath: 0,
    strokeStart: null,
    events: [],
    lastSpan: 0,
    lastXRange: 0,
  };
}

function ampQuality(amp) {
  const a = Number(amp) || 0;
  if (a < STROKE_AMP_LO) return 0;
  if (a <= STROKE_AMP_MID) return (a - STROKE_AMP_LO) / (STROKE_AMP_MID - STROKE_AMP_LO);
  if (a >= STROKE_AMP_HI) return 0;
  return 1 - (a - STROKE_AMP_MID) / (STROKE_AMP_HI - STROKE_AMP_MID);
}

function verticalQuality(xRange) {
  return clamp(1 - (Number(xRange) || 0) / REVERSAL_MIN_Y, 0, 1);
}

function intervalQuality(events, now) {
  const recent = (events || []).filter((e) => now - e.t <= 1.6 && e.interval != null);
  if (recent.length < 2) return 1;
  const ints = recent.map((e) => e.interval).filter((v) => v > 1e-4);
  if (ints.length < 2) return 1;
  const mean = ints.reduce((s, v) => s + v, 0) / ints.length;
  if (mean <= 1e-4) return 0;
  let varSum = 0;
  for (const v of ints) varSum += (v - mean) * (v - mean);
  const cv = Math.sqrt(varSum / ints.length) / mean;
  return clamp(1 - cv / 0.55, 0, 1);
}

function computeStrokeQ(events, now, amp, xRange) {
  const completed = (events || []).filter((e) => e.span != null);
  if (completed.length < 2) return 0.1;
  const aQ = ampQuality(amp);
  const vQ = verticalQuality(xRange);
  const iQ = intervalQuality(events, now);
  return clamp(0.4 * aQ + 0.4 * vQ + 0.2 * iQ, 0, 1);
}

function tempoInst(events, now, sawStart) {
  const times = [];
  if (sawStart != null && now - sawStart <= TEMPO_WINDOW && now - sawStart >= -1e-9) times.push(sawStart);
  for (const e of events || []) {
    if (now - e.t <= TEMPO_WINDOW && now - e.t >= -1e-9) times.push(e.t);
  }
  if (times.length < 2) {
    if (times.length === 1 && events && events.length && events[events.length - 1].interval) {
      return 1 / 2 / Math.max(events[events.length - 1].interval, 1e-4);
    }
    return 0;
  }
  const span = times[times.length - 1] - times[0];
  if (span <= 1e-4) return 0;
  return (times.length - 1) / 2 / span;
}

function recomputeRate(tempo, amp, strokeQ) {
  const ampW = bump(amp, AMP_BUMP_MID, AMP_BUMP_HALF);
  const tempoW = tempoWeight(tempo);
  return SAW_RATE_MAX * ampW * tempoW * (Number(strokeQ) || 0);
}

function decayRight(next, step) {
  const k = Math.exp(-step / TEMPO_DECAY_TAU);
  next.tempo = (Number(next.tempo) || 0) * k;
  next.amp = (Number(next.amp) || 0) * Math.exp(-step / AMP_SMOOTH_TAU);
  next.strokeQ = (Number(next.strokeQ) || 0) * k;
  next.sawRate = recomputeRate(next.tempo, next.amp, next.strokeQ);
  next.prevY = null;
  next.prevX = null;
  next.prevDir = null;
  next.contactPath = 0;
  next.strokeStart = null;
  next.sawStart = null;
  return next;
}

/**
 * Update sawing from a right-hand sample.
 * When inactive, tempo decays with tau 0.20 and the current stroke is dropped.
 */
export function updateRight(right, pos, dt, active) {
  const next = {
    prevY: right?.prevY ?? null,
    prevX: right?.prevX ?? null,
    prevDir: right?.prevDir ?? null,
    tempo: Number(right?.tempo) || 0,
    amp: Number(right?.amp) || 0,
    strokeQ: Number(right?.strokeQ) || 0,
    sawRate: Number(right?.sawRate) || 0,
    clock: Number(right?.clock) || 0,
    sawStart: right?.sawStart ?? null,
    contactPath: Number(right?.contactPath) || 0,
    strokeStart: right?.strokeStart ? { ...right.strokeStart } : null,
    events: Array.isArray(right?.events) ? right.events.map((e) => ({ ...e })) : [],
    lastSpan: Number(right?.lastSpan) || 0,
    lastXRange: Number(right?.lastXRange) || 0,
  };
  const step = Math.max(0, Number(dt) || 0);
  next.clock += step;
  if (!active || !pos) return decayRight(next, step);

  const x = Number(pos.x);
  const y = Number(pos.y);

  if (next.prevY == null || next.prevX == null) {
    next.prevY = y;
    next.prevX = x;
    next.prevDir = null;
    next.contactPath = 0;
    next.strokeStart = { x, y, t: next.clock, minX: x, maxX: x };
    next.sawStart = next.clock;
    const inst = tempoInst(next.events, next.clock, next.sawStart);
    if (step > 0) {
      next.tempo += (inst - next.tempo) * (1 - Math.exp(-step / TEMPO_SMOOTH_TAU));
    }
    next.strokeQ = computeStrokeQ(next.events, next.clock, next.amp, next.lastXRange);
    next.sawRate = recomputeRate(next.tempo, next.amp, next.strokeQ);
    return next;
  }

  const dy = y - next.prevY;
  const dx = x - next.prevX;
  next.contactPath += Math.hypot(dx, dy);
  if (next.strokeStart) {
    next.strokeStart.minX = Math.min(next.strokeStart.minX, x);
    next.strokeStart.maxX = Math.max(next.strokeStart.maxX, x);
  }

  let dir = next.prevDir;
  if (step > 0 && Math.abs(dy) > 1e-9) dir = Math.sign(dy);

  const started = next.strokeStart;
  const travelY = started ? Math.abs(y - started.y) : 0;
  const reversed = dir != null && next.prevDir != null && dir !== next.prevDir;
  const longEnough = travelY >= REVERSAL_MIN_Y && next.contactPath >= TAP_PATH;
  if (reversed && longEnough) {
    const span = travelY;
    const xRange = started ? started.maxX - started.minX : Math.abs(dx);
    const lastT = next.events.length ? next.events[next.events.length - 1].t : started?.t ?? next.clock;
    const interval = next.clock - lastT;
    next.events.push({
      t: next.clock,
      y,
      x,
      span,
      xRange,
      interval: interval > 0 ? interval : null,
    });
    if (next.events.length > MAX_EVENTS) next.events.splice(0, next.events.length - MAX_EVENTS);
    next.lastSpan = span;
    next.lastXRange = xRange;
    next.strokeStart = { x, y, t: next.clock, minX: x, maxX: x };
    if (step > 0) {
      next.amp += (span - next.amp) * (1 - Math.exp(-step / AMP_SMOOTH_TAU));
    } else {
      next.amp = span;
    }
  } else if (reversed && !longEnough) {
    // Short flicker: restart the stroke at this extreme, do not count a reversal.
    next.strokeStart = { x, y, t: next.clock, minX: x, maxX: x };
  }

  const inst = tempoInst(next.events, next.clock, next.sawStart);
  if (step > 0) {
    if ((next.tempo === 0 || !Number.isFinite(next.tempo)) && inst > 0) next.tempo = inst;
    else next.tempo += (inst - next.tempo) * (1 - Math.exp(-step / TEMPO_SMOOTH_TAU));
    if (!reversed || !longEnough) {
      // Keep amp smoothing toward the last measured span (or the in-progress travel if larger).
      const target = Math.max(next.lastSpan, travelY >= REVERSAL_MIN_Y ? travelY : next.lastSpan);
      if (target > 0) next.amp += (target - next.amp) * (1 - Math.exp(-step / AMP_SMOOTH_TAU));
    }
  }
  next.strokeQ = computeStrokeQ(next.events, next.clock, next.amp || next.lastSpan, next.lastXRange);
  next.sawRate = recomputeRate(next.tempo, next.amp, next.strokeQ);
  next.prevY = y;
  next.prevX = x;
  if (dir != null) next.prevDir = dir;
  return next;
}

