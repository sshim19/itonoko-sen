/** Positions → feed and ω. Blade-axis pose update. Checkable pure functions. */

import {
  BLADE_X,
  BLADE_Y,
  FEED_DECAY_TAU,
  FEED_SMOOTH_TAU,
  GRIP_CX,
  GRIP_CY,
  OMEGA_DECAY_TAU,
  OMEGA_MAX,
  OMEGA_SMOOTH_TAU,
  clamp,
  feedDesired,
  foldPi,
  rotateWeight,
} from "./constants.mjs";

export { feedDesired, foldPi, rotateWeight, yFromFeed } from "./constants.mjs";

export function emptyLeft() {
  return { prevTheta: null, omega: 0, r: 0, feed: 0 };
}

/**
 * Blade coordinates in board space.
 * dx, dy = blade table pos − board origin; then rotate by −phi.
 */
export function bladeBoardCoords(boardX, boardY, boardPhi) {
  const dx = BLADE_X - Number(boardX);
  const dy = BLADE_Y - Number(boardY);
  const c = Math.cos(boardPhi);
  const s = Math.sin(boardPhi);
  return {
    bladeWx: dx * c + dy * s,
    bladeWy: -dx * s + dy * c,
  };
}

/** Board origin that places the blade at (bladeWx, bladeWy) with angle phi. */
export function poseFromBlade(bladeWx, bladeWy, boardPhi) {
  const c = Math.cos(boardPhi);
  const s = Math.sin(boardPhi);
  const dx = bladeWx * c - bladeWy * s;
  const dy = bladeWx * s + bladeWy * c;
  return {
    boardX: BLADE_X - dx,
    boardY: BLADE_Y - dy,
    boardPhi,
  };
}

/** Direction of a positive feed in board space: (−cos φ, sin φ). */
export function feedDir(boardPhi) {
  return { x: -Math.cos(boardPhi), y: Math.sin(boardPhi) };
}

/**
 * Rotate the board around the blade so the blade's board coordinates stay put.
 */
export function applyRotationAroundBlade({ boardX, boardY, boardPhi, omega, dt }) {
  const step = Math.max(0, Number(dt) || 0);
  const { bladeWx, bladeWy } = bladeBoardCoords(boardX, boardY, boardPhi);
  const nextPhi = Number(boardPhi) + (Number(omega) || 0) * 2 * Math.PI * step;
  const pose = poseFromBlade(bladeWx, bladeWy, nextPhi);
  return { ...pose, bladeWx, bladeWy };
}

/**
 * Translate the board along +X by sign(feed) * applied, then rotate around the blade.
 * After a snap, the caller must not use this.
 */
export function applyBoardMotion({ boardX, boardY, boardPhi, feed, applied, omega, dt }) {
  const dir = Math.sign(Number(feed) || 0);
  const nextX = Number(boardX) + dir * (Number(applied) || 0);
  return applyRotationAroundBlade({
    boardX: nextX,
    boardY,
    boardPhi,
    omega,
    dt,
  });
}

/**
 * Update feed and ω from a left-hand sample.
 * When inactive or not landscape, both decay (ω τ=0.20, feed τ=0.16).
 */
export function updateLeft(left, pos, dt, active) {
  const next = {
    prevTheta: left?.prevTheta ?? null,
    omega: Number(left?.omega) || 0,
    r: Number(left?.r) || 0,
    feed: Number(left?.feed) || 0,
  };
  const step = Math.max(0, Number(dt) || 0);
  if (!active || !pos) {
    next.omega = next.omega * Math.exp(-step / OMEGA_DECAY_TAU);
    next.feed = next.feed * Math.exp(-step / FEED_DECAY_TAU);
    next.prevTheta = null;
    return next;
  }
  const x = Number(pos.x);
  const y = Number(pos.y);
  const dx = x - GRIP_CX;
  const dy = y - GRIP_CY;
  const r = Math.hypot(dx, dy);
  const theta = Math.atan2(dy, dx);
  const weight = rotateWeight(r);
  next.r = r;

  const des = feedDesired(y);
  if (step > 0) {
    next.feed += (des - next.feed) * (1 - Math.exp(-step / FEED_SMOOTH_TAU));
  }

  if (weight <= 0 || !(step > 0) || next.prevTheta == null) {
    if (weight <= 0) next.omega = next.omega * Math.exp(-step / OMEGA_DECAY_TAU);
    next.prevTheta = theta;
    return next;
  }
  const dTheta = foldPi(theta - next.prevTheta);
  let inst = dTheta / step / (2 * Math.PI);
  inst *= weight;
  next.omega += (inst - next.omega) * (1 - Math.exp(-step / OMEGA_SMOOTH_TAU));
  next.omega = clamp(next.omega, -OMEGA_MAX, OMEGA_MAX);
  next.prevTheta = theta;
  return next;
}
