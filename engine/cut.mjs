/** Capacity and bend, tears and snaps, kerf, completion / accuracy / smoothness. */

import {
  ACCURACY_SCALE,
  BEND_GROW,
  BEND_RECOVER,
  BEND_REF_FEED,
  COVER_WIDTH,
  DEV_CAP,
  JAGGED_SCALE,
  KERF_MAX,
  KERF_MIN_STEP,
  MATCH_SAMPLES,
  OVERFLOW_APPLY,
  TEAR_COOLDOWN,
  TEAR_OFFSET,
  TEAR_THRESH,
  clamp,
  gradeForScore,
} from "./constants.mjs";
import { applyBoardMotion, bladeBoardCoords } from "./feed.mjs";

export function kerfLength(kerf) {
  const pts = kerf || [];
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return s;
}

export function distToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 < 1e-12) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function distToPoly(p, poly) {
  const pts = poly || [];
  if (!pts.length) return Infinity;
  if (pts.length === 1) return Math.hypot(p.x - pts[0].x, p.y - pts[0].y);
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const d = distToSegment(p, pts[i - 1], pts[i]);
    if (d < best) best = d;
  }
  return best;
}

export function pathLength(pts) {
  return kerfLength(pts);
}

export function resamplePath(path, n = MATCH_SAMPLES) {
  const pts = path || [];
  if (n <= 0) return [];
  if (!pts.length) return [];
  if (pts.length === 1) return Array.from({ length: n }, () => ({ x: pts[0].x, y: pts[0].y }));
  const total = pathLength(pts);
  if (total <= 1e-9) return Array.from({ length: n }, () => ({ x: pts[0].x, y: pts[0].y }));
  const out = [];
  for (let i = 0; i < n; i++) {
    const target = (i / Math.max(1, n - 1)) * total;
    out.push(pointAlong(pts, target));
  }
  return out;
}

export function pointAlong(pts, dist) {
  if (!pts.length) return { x: 0, y: 0 };
  if (dist <= 0) return { x: pts[0].x, y: pts[0].y };
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const step = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (acc + step >= dist) {
      const u = (dist - acc) / Math.max(step, 1e-9);
      return {
        x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * u,
        y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * u,
      };
    }
    acc += step;
  }
  const last = pts[pts.length - 1];
  return { x: last.x, y: last.y };
}

export function cloneKerf(kerf) {
  return (kerf || []).map((p) => ({ x: p.x, y: p.y }));
}

export function addKerfPoint(kerf, p) {
  const out = cloneKerf(kerf);
  const last = out[out.length - 1];
  if (last && Math.hypot(p.x - last.x, p.y - last.y) < KERF_MIN_STEP - 1e-9) return out;
  out.push({ x: p.x, y: p.y });
  if (out.length > KERF_MAX) out.splice(0, out.length - KERF_MAX);
  return out;
}

/**
 * Score parts from the current kerf and the daily path.
 * `meanDev` is capped at 18wu. An almost-empty kerf forces accuracy = 0
 * and smoothness looks only at tears and a snap.
 */
export function scoreParts(
  kerf,
  path,
  { tearCount = 0, snapped = false, meanBend = 0, coverWidth = COVER_WIDTH, accuracyScale = ACCURACY_SCALE } = {},
) {
  const samples = resamplePath(path, MATCH_SAMPLES);
  const pts = kerf || [];
  const empty = pts.length < 2 || kerfLength(pts) < 1;
  let covered = 0;
  if (!empty && samples.length) {
    for (let i = 0; i < samples.length; i++) {
      if (distToPoly(samples[i], pts) <= coverWidth) covered += 1;
    }
  }
  const completion = samples.length ? covered / samples.length : 0;
  let meanDev;
  if (empty) meanDev = DEV_CAP;
  else {
    let sum = 0;
    for (let i = 0; i < pts.length; i++) sum += Math.min(DEV_CAP, distToPoly(pts[i], path));
    meanDev = sum / pts.length;
  }
  const accuracy = empty ? 0 : Math.max(0, 1 - meanDev / accuracyScale);
  const coveredLen = completion * pathLength(path);
  const kLen = kerfLength(pts);
  const jagged = empty ? 0 : clamp((kLen / Math.max(coveredLen, 1) - 1) / JAGGED_SCALE, 0, 1);
  const tearTerm = 0.28 * Math.min((Number(tearCount) || 0) / 4, 1);
  const snapTerm = 0.22 * (snapped ? 1 : 0);
  const bendTerm = empty ? 0 : 0.15 * clamp(Number(meanBend) || 0, 0, 1);
  const jagTerm = empty ? 0 : 0.5 * jagged;
  const smoothness = 1 - clamp(jagTerm + tearTerm + snapTerm + bendTerm, 0, 1);
  const raw = 100 * (0.7 * completion * accuracy + 0.3 * completion * smoothness);
  const score = Math.round(raw);
  return {
    completion,
    meanDev,
    accuracy,
    coveredLen,
    jagged,
    smoothness,
    score,
    grade: gradeForScore(score),
  };
}

export function previewScore(partsOrState) {
  if (partsOrState && typeof partsOrState.completion === "number" && partsOrState.accuracy != null) {
    const { completion, accuracy, smoothness } = partsOrState;
    return Math.round(100 * (0.7 * completion * accuracy + 0.3 * completion * smoothness));
  }
  return 0;
}

/**
 * One cutting step. Does not run after a snap; the caller should skip motion then.
 * Returns updated pose, kerf, bend, tear, snap, and the overflow used for checks.
 */
export function stepCut({
  boardX,
  boardY,
  boardPhi,
  kerf,
  bend,
  tearCount,
  tearWait,
  snapped,
  feed,
  omega = 0,
  sawRate,
  sawK = 1,
  bendK = 1,
  tearK = 1,
  dt,
  bendGrow = BEND_GROW,
} = {}) {
  const step = Math.max(0, Number(dt) || 0);
  const k = Number(sawK) || 0;
  const rate = Math.max(0, Number(sawRate) || 0);
  const f = Number(feed) || 0;
  let nextBend = clamp(Number(bend) || 0, 0, 1);
  let nextTear = Number(tearCount) || 0;
  let nextWait = Math.max(0, (Number(tearWait) || 0) - step);
  let nextSnap = !!snapped;
  let nextKerf = cloneKerf(kerf);
  let pose = { boardX, boardY, boardPhi, ...bladeBoardCoords(boardX, boardY, boardPhi) };

  if (nextSnap || step <= 0) {
    return {
      ...pose,
      kerf: nextKerf,
      bend: nextBend,
      tearCount: nextTear,
      tearWait: Math.max(0, Number(tearWait) || 0),
      snapped: nextSnap,
      capacity: 0,
      request: 0,
      applied: 0,
      overflow: 0,
    };
  }

  const capacity = k * rate * step;
  const request = Math.abs(f) * step;
  const overflow = Math.max(0, request - capacity);
  const applied = Math.min(request, capacity) + OVERFLOW_APPLY * overflow;

  const dbend =
    (Number(bendK) || 0) * bendGrow * (overflow / Math.max(step, 1e-4) / BEND_REF_FEED) * step -
    (overflow === 0 ? BEND_RECOVER * nextBend * step : 0);
  nextBend = clamp(nextBend + dbend, 0, 1);
  if (nextBend >= 1 - 1e-12) {
    nextBend = 1;
    nextSnap = true;
  }

  pose = applyBoardMotion({
    boardX,
    boardY,
    boardPhi,
    feed: f,
    applied,
    omega: omega || 0,
    dt: step,
  });

  const last = nextKerf[nextKerf.length - 1];
  const moved = last ? Math.hypot(pose.bladeWx - last.x, pose.bladeWy - last.y) : KERF_MIN_STEP;
  if (moved >= KERF_MIN_STEP) {
    let px = pose.bladeWx;
    let py = pose.bladeWy;
    if (!nextSnap && overflow > 0 && nextBend > TEAR_THRESH && nextWait <= 0) {
      const tx = last ? pose.bladeWx - last.x : 1;
      const ty = last ? pose.bladeWy - last.y : 0;
      const len = Math.hypot(tx, ty) || 1;
      const mag = (Number(tearK) || 0) * (nextBend - TEAR_THRESH) * TEAR_OFFSET;
      px += (-ty / len) * mag;
      py += (tx / len) * mag;
      nextTear += 1;
      nextWait = TEAR_COOLDOWN;
    }
    nextKerf = addKerfPoint(nextKerf, { x: px, y: py });
  }

  // If we just snapped, keep the pose of this tick (the last motion is allowed) but
  // later ticks will freeze. The DESIGN stops further progress once bend reaches 1.
  return {
    ...pose,
    kerf: nextKerf,
    bend: nextBend,
    tearCount: nextTear,
    tearWait: nextWait,
    snapped: nextSnap,
    capacity,
    request,
    applied,
    overflow,
  };
}
