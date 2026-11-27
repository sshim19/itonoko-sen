/**
 * 重ねの開示、吹き出し、粉、しなりの見え。
 * エンジンは触らず、state の差分から演出を進める。
 */

import * as constants from "../engine/constants.mjs";
import { dailyCondition, formatScore, gradeCallout } from "./share.mjs";

export const JUDGE_BALLOON_OFFSET = constants.JUDGE_BALLOON_OFFSET ?? 70;
export const BLADE_X = constants.BLADE_X ?? 400;
export const BLADE_Y = constants.BLADE_Y ?? 220;
export const OVERLAY_CX = constants.OVERLAY_CX ?? 422;
export const OVERLAY_CY = constants.OVERLAY_CY ?? 200;
export const COVER_DIST = constants.COVER_DIST ?? constants.COVER_WIDTH ?? 6;
export const OFF_DIST = constants.OFF_LINE ?? constants.OFF_LINE_DIST ?? 8;
export const BEND_STATUS = constants.BEND_CALLOUT ?? constants.BEND_STATUS ?? 0.55;
export const BEND_ON = constants.BEND_RIDING ?? constants.BEND_ON ?? 0.2;
export const SET_TIME = constants.PLACE_TIME ?? constants.SET_TIME ?? constants.SET_DURATION ?? 1.2;

const DUST_CAP = 18;
const FONT = `"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif`;

function clamp01(n) {
  return Math.max(0, Math.min(1, Number(n) || 0));
}

function rgba(hex, a) {
  const n = parseInt(String(hex || "#f3eee4").replace("#", ""), 16);
  if (!Number.isFinite(n)) return `rgba(243, 238, 228, ${a})`;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/**
 * 折れ線への最短距離。点が空なら Infinity。
 * @param {{ x: number, y: number }[] | null | undefined} path
 * @param {number} x
 * @param {number} y
 */
export function distToPolyline(path, x, y) {
  if (!Array.isArray(path) || path.length === 0) return Infinity;
  if (path.length === 1) {
    const p = path[0];
    return Math.hypot(x - (Number(p.x) || 0), y - (Number(p.y) || 0));
  }
  let min = Infinity;
  for (let i = 1; i < path.length; i++) {
    const ax = Number(path[i - 1].x) || 0;
    const ay = Number(path[i - 1].y) || 0;
    const bx = Number(path[i].x) || 0;
    const by = Number(path[i].y) || 0;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = 0;
    if (len2 > 1e-8) t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
    const px = ax + dx * t;
    const py = ay + dy * t;
    const d = Math.hypot(x - px, y - py);
    if (d < min) min = d;
  }
  return min;
}

export function bladeBoardPos(state) {
  const wx = Number(state?.bladeWx);
  const wy = Number(state?.bladeWy);
  if (Number.isFinite(wx) && Number.isFinite(wy)) return { x: wx, y: wy };
  const boardX = Number(state?.boardX) || 0;
  const boardY = Number(state?.boardY) || 0;
  const phi = Number(state?.boardPhi) || 0;
  const c = Math.cos(phi);
  const s = Math.sin(phi);
  const dx = BLADE_X - boardX;
  const dy = BLADE_Y - boardY;
  return { x: dx * c + dy * s, y: -dx * s + dy * c };
}

/**
 * 切断中の状態文。折れが最優先、次にしなり、次に外れ。
 * @param {object} [state]
 * @returns {string}
 */
export function statusFrom(state) {
  if (state?.status !== "playing" || state?.phase !== "cut") return "";
  if (state?.snapped) return "刃が折れた";
  const bend = Number(state?.bend) || 0;
  if (bend >= BEND_STATUS) return "刃がしなっている";
  const blade = bladeBoardPos(state);
  const dist = distToPolyline(state?.params?.path, blade.x, blade.y);
  if (Number.isFinite(dist) && dist >= OFF_DIST) return "線から外れた";
  const sawing = (Number(state?.right?.sawRate) || 0) > 0.6;
  if (!state?.snapped && dist <= COVER_DIST && bend < BEND_ON && sawing) return "乗っている";
  return "";
}

export function createFx() {
  return {
    clock: 0,
    stroke: 0,
    dust: [],
    trails: [],
    floats: [],
    revealZoom: 1,
    placeT: 0,
    dailyAlpha: 0,
    statusAlpha: 0,
    statusText: "",
    prev: null,
  };
}

export function resetFx(fx) {
  if (!fx) return;
  fx.clock = 0;
  fx.stroke = 0;
  fx.dust.length = 0;
  fx.trails.length = 0;
  fx.floats.length = 0;
  fx.revealZoom = 1;
  fx.placeT = 0;
  fx.dailyAlpha = 0;
  fx.statusAlpha = 0;
  fx.statusText = "";
  fx.prev = null;
}

function spawnBalloons(fx, state) {
  const grade = state?.grade || "early";
  const score = Math.max(0, Math.floor(Number(state?.score) || 0));
  fx.floats.length = 0;
  fx.floats.push({
    kind: "grade",
    text: gradeCallout(grade),
    age: 0,
    color: "#1c2430",
  });
  fx.floats.push({
    kind: "score",
    text: `${formatScore(score)}点`,
    age: 0,
    color: "#1c2430",
  });
}

function addDust(fx, reduced) {
  const cap = reduced ? 0 : DUST_CAP;
  if (cap <= 0 || fx.dust.length >= cap) return;
  if (Math.random() > 0.62) return;
  const ang = Math.random() * Math.PI * 2;
  const spd = 18 + Math.random() * 36;
  fx.dust.push({
    x: BLADE_X + (Math.random() - 0.5) * 6,
    y: BLADE_Y + (Math.random() - 0.5) * 6,
    vx: Math.cos(ang) * spd,
    vy: Math.sin(ang) * spd * 0.7 - 8,
    r: 1.1 + Math.random() * 1.8,
    life: 0.28 + Math.random() * 0.32,
    max: 0.6,
  });
}

/**
 * @param {object} fx
 * @param {object} state
 * @param {number} dt
 * @param {{ reducedMotion?: boolean, right?: object, left?: object }} [opts]
 */
export function syncFx(fx, state, dt, opts = {}) {
  if (!fx) return;
  const reduced = !!opts.reducedMotion;
  const t = Math.max(0, Number(dt) || 0);
  fx.clock += t;

  const phase = state?.phase;
  const playing = state?.status === "playing";
  fx.placeT = phase === "set" && playing ? Number(state?.phaseT) || 0 : 0;

  const wantDaily = !!(playing && state?.showDailyLine);
  fx.dailyAlpha += ((wantDaily ? 1 : 0) - fx.dailyAlpha) * (1 - Math.exp(-t / 0.2));

  const nextStatus = statusFrom(state);
  if (nextStatus) fx.statusText = nextStatus;
  const wantStatus = nextStatus ? 1 : 0;
  if (!playing || phase === "reveal") {
    fx.statusAlpha = 0;
    if (!nextStatus) fx.statusText = "";
  } else {
    fx.statusAlpha += (wantStatus - fx.statusAlpha) * (1 - Math.exp(-t / 0.16));
    if (fx.statusAlpha < 0.02 && !nextStatus) fx.statusText = "";
  }

  const zoomTarget = playing && phase === "reveal" ? (reduced ? 1.03 : 1.08) : 1;
  fx.revealZoom += (zoomTarget - fx.revealZoom) * (1 - Math.exp(-t / (reduced ? 0.2 : 0.35)));

  const prevPhase = fx.prev?.phase;
  const prevStatus = fx.prev?.status;
  if (
    (prevPhase !== "reveal" && phase === "reveal") ||
    (prevStatus !== "over" && state?.status === "over" && fx.floats.length === 0)
  ) {
    spawnBalloons(fx, state);
  }

  const sawRate = Number(state?.right?.sawRate) || 0;
  const cutting = playing && phase === "cut" && !state?.snapped && sawRate > 0.6;
  if (cutting && !reduced) {
    const rate = 8 + Math.min(16, sawRate * 0.9);
    const steps = Math.max(1, Math.round(rate * t));
    for (let i = 0; i < steps; i++) addDust(fx, reduced);
  } else if (!cutting || reduced) {
    if (reduced) fx.dust.length = 0;
  }

  for (let i = fx.dust.length - 1; i >= 0; i--) {
    const p = fx.dust[i];
    p.life -= t;
    p.x += p.vx * t;
    p.y += p.vy * t;
    p.vy += 40 * t;
    p.vx *= Math.exp(-t / 0.45);
    if (p.life <= 0) fx.dust.splice(i, 1);
  }
  if (fx.dust.length > DUST_CAP) fx.dust.splice(0, fx.dust.length - DUST_CAP);

  const right = opts.right;
  if (right?.active && Number.isFinite(right.y)) {
    const target = right.y - BLADE_Y;
    fx.stroke += (target - fx.stroke) * (1 - Math.exp(-t / 0.05));
  } else if (cutting && !reduced) {
    const tempo = Number(state?.right?.tempo) || 0;
    const amp = Math.min(36, (Number(state?.right?.amp) || 0) * 0.35);
    if (tempo > 0.3 && amp > 4) {
      fx.stroke = Math.sin(fx.clock * tempo * Math.PI * 2) * amp;
    }
  } else {
    fx.stroke += (0 - fx.stroke) * (1 - Math.exp(-t / 0.18));
  }

  if (cutting && !reduced && Math.abs(fx.stroke) > 4) {
    const last = fx.trails[fx.trails.length - 1];
    if (!last || fx.clock - last.at >= 0.045) {
      fx.trails.push({ at: fx.clock, stroke: fx.stroke, bend: Number(state?.bend) || 0, life: 0.16, max: 0.16 });
    }
  } else if (reduced || !cutting) {
    if (reduced) fx.trails.length = 0;
  }
  for (let i = fx.trails.length - 1; i >= 0; i--) {
    const tr = fx.trails[i];
    tr.life -= t;
    if (tr.life <= 0) fx.trails.splice(i, 1);
  }
  if (fx.trails.length > 6) fx.trails.splice(0, fx.trails.length - 6);

  for (let i = fx.floats.length - 1; i >= 0; i--) {
    const f = fx.floats[i];
    f.age = (Number(f.age) || 0) + t;
  }

  fx.prev = {
    status: state?.status,
    phase: state?.phase,
    grade: state?.grade,
    score: state?.score,
  };
}

export function revealZoom(fx, reduced) {
  if (!fx) return 1;
  const z = Number(fx.revealZoom) || 1;
  if (reduced) return Math.min(z, 1.03);
  return z;
}

export function overlayCenter() {
  return { x: OVERLAY_CX, y: OVERLAY_CY };
}

export function placeLift(state, fx, reduced) {
  if (state?.status !== "playing" || state?.phase !== "set") return 0;
  const t = Number(fx?.placeT ?? state?.phaseT) || 0;
  const u = clamp01(t / SET_TIME);
  const ease = 1 - Math.pow(1 - u, 3);
  return (1 - ease) * (reduced ? 16 : 36);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} fx
 * @param {{ sx: Function, sy: Function, px: Function, reducedMotion?: boolean }} view
 * @param {object} [state]
 */
export function drawFx(ctx, fx, view, state) {
  if (!fx) return;
  const reduced = !!view.reducedMotion;
  const sx = (x) => view.sx(x);
  const sy = (y) => view.sy(y);
  const px = (w) => view.px(w);

  for (const p of fx.dust) {
    const u = Math.max(0, Math.min(1, p.life / (p.max || 1)));
    ctx.fillStyle = rgba("#c9ae78", 0.16 + 0.4 * u);
    ctx.beginPath();
    ctx.ellipse(sx(p.x), sy(p.y), px(p.r * (1 + (1 - u) * 0.35)), px(p.r * 0.9), 0, 0, Math.PI * 2);
    ctx.fill();
  }

  if (fx.dailyAlpha > 0.04 && state?.showDailyLine !== false) {
    const text = dailyCondition(state?.params);
    const x = sx(BLADE_X - 70);
    const y = sy(BLADE_Y + 64);
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, fx.dailyAlpha));
    ctx.font = `700 ${Math.max(11, px(11))}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = rgba("#f3eee4", 0.92);
    const padX = 8;
    const padY = 4;
    const h = Math.max(16, px(14));
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(x - tw / 2 - padX, y - h / 2 - padY, tw + padX * 2, h + padY * 2, 6);
    } else {
      ctx.rect(x - tw / 2 - padX, y - h / 2 - padY, tw + padX * 2, h + padY * 2);
    }
    ctx.fill();
    ctx.fillStyle = "#1c2430";
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  if (fx.statusAlpha > 0.05 && fx.statusText) {
    const text = fx.statusText;
    const x = sx(BLADE_X);
    const y = sy(BLADE_Y - 46);
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = Math.max(0, Math.min(1, fx.statusAlpha));
    ctx.font = `700 ${Math.max(13, px(14))}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const tw = ctx.measureText(text).width;
    const padX = 9;
    const padY = 5;
    const h = Math.max(18, px(16));
    ctx.fillStyle = rgba("#f3eee4", 0.96);
    ctx.strokeStyle = rgba("#1c2430", 0.16);
    ctx.lineWidth = Math.max(1, px(1));
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(-tw / 2 - padX, -h / 2 - padY, tw + padX * 2, h + padY * 2, 6);
    } else {
      ctx.rect(-tw / 2 - padX, -h / 2 - padY, tw + padX * 2, h + padY * 2);
    }
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#1c2430";
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  const cx = OVERLAY_CX;
  const cy = OVERLAY_CY - JUDGE_BALLOON_OFFSET;
  // Only during the reveal beat. Phase stays "reveal" after status becomes "over",
  // but the end panel already shows the grade and score.
  const showBalloons = state?.status === "playing" && state?.phase === "reveal";
  for (let i = 0; showBalloons && i < fx.floats.length; i++) {
    const f = fx.floats[i];
    const age = Number(f.age) || 0;
    let pop = 1;
    if (!reduced) {
      if (age < 0.12) pop = 0.7 + 0.55 * (age / 0.12);
      else if (age < 0.22) pop = 1.25 - 0.25 * ((age - 0.12) / 0.1);
      else pop = 1;
    }
    const fade = Math.min(1, age / 0.08);
    const lift = reduced ? 0 : Math.min(8, age * 10);
    const row = f.kind === "grade" ? 0 : 22;
    const x = sx(cx);
    const y = sy(cy + row) - px(lift);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(pop, pop);
    ctx.globalAlpha = fade;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const size = f.kind === "grade" ? Math.max(16, px(20)) : Math.max(13, px(15));
    ctx.font = `700 ${size}px ${FONT}`;
    const tw = ctx.measureText(f.text).width;
    ctx.fillStyle = rgba("#f3eee4", 0.92);
    const padX = 8;
    const padY = 4;
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(-tw / 2 - padX, -size / 2 - padY, tw + padX * 2, size + padY * 2, 6);
    } else {
      ctx.rect(-tw / 2 - padX, -size / 2 - padY, tw + padX * 2, size + padY * 2);
    }
    ctx.fill();
    ctx.fillStyle = f.color || "#1c2430";
    ctx.fillText(f.text, 0, 0);
    ctx.restore();
  }
}
