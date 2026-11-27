/** tick(state, input, dt) → state. Place, cut, reveal, finish. No DOM. */

import {
  BLADE_X,
  BLADE_Y,
  COVER_WIDTH,
  CUT_TIME,
  DAILY_LINE_TIME,
  FINISH_MIN,
  FIXED_DT,
  MAX_DT,
  PLACE_TIME,
  REVEAL_TIME,
} from "./constants.mjs";
import { scoreParts } from "./cut.mjs";
import { dailyParams } from "./daily.mjs";
import {
  bladeBoardCoords,
  emptyLeft,
  feedDir,
  poseFromBlade,
  updateLeft,
} from "./feed.mjs";
import { hashSeed } from "./rng.mjs";
import { emptyRight, updateRight } from "./saw.mjs";
import { stepCut } from "./cut.mjs";

export { bladeBoardCoords, feedDir, poseFromBlade };
export { scoreParts };

export function previewScore(s) {
  if (!s) return 0;
  const completion = Number(s.completion) || 0;
  const accuracy = Number(s.accuracy) || 0;
  const smoothness = Number(s.smoothness) || 0;
  return Math.round(100 * (0.7 * completion * accuracy + 0.3 * completion * smoothness));
}

function clonePath(path) {
  return (path || []).map((p) => ({ x: p.x, y: p.y }));
}

function cloneKerf(kerf) {
  return (kerf || []).map((p) => ({ x: p.x, y: p.y }));
}

function cloneRight(r) {
  if (!r) return emptyRight();
  return {
    ...r,
    strokeStart: r.strokeStart ? { ...r.strokeStart } : null,
    events: Array.isArray(r.events) ? r.events.map((e) => ({ ...e })) : [],
  };
}

function cloneState(s) {
  return {
    ...s,
    params: s.params
      ? {
          ...s.params,
          path: clonePath(s.params.path),
        }
      : s.params,
    left: { ...s.left },
    right: cloneRight(s.right),
    kerf: cloneKerf(s.kerf),
  };
}

function hands(input) {
  const leftOn = !!input?.left?.active;
  const rightOn = !!input?.right?.active;
  return {
    leftOn,
    rightOn,
    leftPos: leftOn ? { x: Number(input.left.x), y: Number(input.left.y) } : null,
    rightPos: rightOn ? { x: Number(input.right.x), y: Number(input.right.y) } : null,
  };
}

function initialPose(path) {
  const p0 = path && path[0] ? path[0] : { x: 0, y: 0 };
  const p1 = path && path[1] ? path[1] : { x: p0.x + 1, y: p0.y };
  const T = { x: p1.x - p0.x, y: p1.y - p0.y };
  const len = Math.hypot(T.x, T.y) || 1;
  T.x /= len;
  T.y /= len;
  // +feed moves the blade in board space by (−cos φ, sin φ). Align that with T.
  const boardPhi = Math.atan2(T.y, -T.x);
  const pose = poseFromBlade(p0.x, p0.y, boardPhi);
  const blades = bladeBoardCoords(pose.boardX, pose.boardY, pose.boardPhi);
  return { ...pose, ...blades };
}

function refreshCutScores(s) {
  const parts = scoreParts(s.kerf, s.params.path, {
    tearCount: s.tearCount,
    snapped: s.snapped,
    meanBend: s.meanBend,
  });
  s.accuracy = parts.accuracy;
  s.completion = parts.completion;
  s.smoothness = parts.smoothness;
  return parts;
}

function updateBests(s) {
  if (s.score <= 0) return;
  if (s.score > s.bestScore) s.bestScore = s.score;
  if (s.score > s.todayBestScore) s.todayBestScore = s.score;
}

function canFinish(s) {
  if (s.status !== "playing" || s.phase !== "cut") return false;
  if ((s.completion || 0) >= 1 - 1e-12) return true;
  return s.cutT + 1e-9 >= FINISH_MIN;
}

function finalizeFinish(s) {
  const parts = refreshCutScores(s);
  s.score = parts.score;
  s.grade = parts.grade;
  s.finishedAt = s.cutT;
  s.phase = "reveal";
  s.phaseT = 0;
  s.showDailyLine = false;
  updateBests(s);
}

function applyGestures(s, input, dt, active) {
  const h = hands(input);
  const leftPos = active && h.leftOn ? h.leftPos : null;
  const rightPos = active && h.rightOn ? h.rightPos : null;
  const prevFeed = s.left.feed;
  const prevOmega = s.left.omega;
  const prevRate = s.right.sawRate;
  s.left = updateLeft(s.left, leftPos, dt, !!(active && h.leftOn));
  s.right = updateRight(s.right, rightPos, dt, !!(active && h.rightOn));
  if (active && h.leftOn && (Math.abs(s.left.feed) > 0.4 || Math.abs(s.left.omega) > 0.04) && (Math.abs(s.left.feed - prevFeed) > 1e-6 || Math.abs(s.left.omega - prevOmega) > 1e-6 || s.left.prevTheta != null)) {
    s.hintLeft = false;
  }
  if (active && h.rightOn && (s.right.sawRate > 1 || (s.right.events && s.right.events.length > 0) || s.right.sawRate > prevRate + 0.5)) {
    if (s.right.events && s.right.events.length > 0) s.hintRight = false;
  }
}

function stepCutPhysics(s, dt) {
  if (s.snapped) {
    refreshCutScores(s);
    return;
  }
  const result = stepCut({
    boardX: s.boardX,
    boardY: s.boardY,
    boardPhi: s.boardPhi,
    kerf: s.kerf,
    bend: s.bend,
    tearCount: s.tearCount,
    tearWait: s.tearWait,
    snapped: s.snapped,
    feed: s.left.feed,
    omega: s.left.omega,
    sawRate: s.right.sawRate,
    sawK: s.params.sawK,
    bendK: s.params.bendK,
    tearK: s.params.tearK,
    dt,
  });
  s.boardX = result.boardX;
  s.boardY = result.boardY;
  s.boardPhi = result.boardPhi;
  s.bladeWx = result.bladeWx;
  s.bladeWy = result.bladeWy;
  s.kerf = result.kerf;
  s.bend = result.bend;
  s.tearCount = result.tearCount;
  s.tearWait = result.tearWait;
  s.snapped = result.snapped;
  const nextT = s.cutT + dt;
  s.meanBend = nextT > 1e-9 ? (s.meanBend * s.cutT + s.bend * dt) / nextT : s.bend;
  refreshCutScores(s);
}

function stepPhase(s, input, dt, active) {
  if (s.status !== "playing") return;
  if (s.phase === "set") {
    s.phaseT += dt;
    if (s.phaseT + 1e-9 >= PLACE_TIME) {
      s.phaseT = Math.max(0, s.phaseT - PLACE_TIME);
      s.phase = "cut";
      s.cutT = 0;
      s.showDailyLine = true;
    }
    return;
  }
  if (s.phase === "cut") {
    if (active) stepCutPhysics(s, dt);
    s.cutT += dt;
    s.phaseT += dt;
    s.showDailyLine = s.cutT < DAILY_LINE_TIME;
    if ((s.completion || 0) >= 1 - 1e-12) {
      s.cutT = Math.min(s.cutT, CUT_TIME);
      finalizeFinish(s);
    } else if (s.cutT + 1e-9 >= CUT_TIME) {
      s.cutT = CUT_TIME;
      finalizeFinish(s);
    } else if (input?.finish && canFinish(s)) {
      finalizeFinish(s);
    }
    return;
  }
  if (s.phase === "reveal") {
    s.phaseT += dt;
    if (s.phaseT + 1e-9 >= REVEAL_TIME) s.status = "over";
  }
}

/**
 * Near-pure: same state+input+dt → same result. Does not mutate state or input.
 * Clamps dt to 50ms and steps cutting / phases at 1/60 + remainder.
 * Gestures are applied once per call with the frame dt (positions are samples, not per-substep).
 * When landscape is false, cut / finish are ignored and time does not advance; feed and ω decay.
 */
export function tick(state, input, dt) {
  if (state.status !== "playing") return cloneState(state);
  const s = cloneState(state);
  const rawDt = Math.min(Math.max(Number(dt) || 0, 0), MAX_DT);
  if (!input?.landscape) {
    applyGestures(s, input, rawDt, false);
    return s;
  }
  s.clock = (Number(s.clock) || 0) + rawDt;
  applyGestures(s, input, rawDt, true);
  let left = rawDt;
  while (left > 0 && s.status === "playing") {
    const stepDt = Math.min(FIXED_DT, left);
    stepPhase(s, input, stepDt, true);
    left -= stepDt;
  }
  return s;
}

/**
 * Shared by 「仕上げ」, the time limit, and a completed line.
 * No-op before 22s unless completion is 1, and during set / reveal / when not playing.
 * Landscape is enforced by tick; a direct call assumes the caller already checked orientation.
 */
export function finishNow(state) {
  const s = cloneState(state);
  if (canFinish(s)) finalizeFinish(s);
  return s;
}

/** Fresh playing state. bestScore / todayBestScore are in-memory; persist elsewhere. */
export function createInitialState({ seed, dateJst, bestScore = 0, todayBestScore = 0 } = {}) {
  const rng0 = hashSeed(seed);
  const built = dailyParams(rng0);
  const params = built.params;
  const pose = initialPose(params.path);
  const start = params.path[0] || { x: pose.bladeWx, y: pose.bladeWy };
  const parts = scoreParts([{ x: start.x, y: start.y }], params.path, {
    tearCount: 0,
    snapped: false,
    meanBend: 0,
  });
  return {
    status: "playing",
    phase: "set",
    seed,
    dateJst: dateJst ?? null,
    phaseT: 0,
    cutT: 0,
    clock: 0,
    rngState: built.rngState,
    params,
    left: emptyLeft(),
    right: emptyRight(),
    boardX: pose.boardX,
    boardY: pose.boardY,
    boardPhi: pose.boardPhi,
    bladeWx: pose.bladeWx,
    bladeWy: pose.bladeWy,
    kerf: [{ x: start.x, y: start.y }],
    bend: 0,
    meanBend: 0,
    tearCount: 0,
    tearWait: 0,
    snapped: false,
    accuracy: parts.accuracy,
    completion: parts.completion,
    smoothness: parts.smoothness,
    score: 0,
    grade: null,
    finishedAt: null,
    bestScore: bestScore || 0,
    todayBestScore: todayBestScore || 0,
    hintLeft: true,
    hintRight: true,
    showDailyLine: false,
  };
}

export { COVER_WIDTH, BLADE_X, BLADE_Y };
