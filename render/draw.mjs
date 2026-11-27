/**
 * 工房・板・線・切り口・刃と枠・左右の域・縮小図。844×390 論理座標。Y は下向き。
 * 画像アセットは使わない。定数の意味は書き換えない。
 */

import * as constants from "../engine/constants.mjs";
import { drawFx, revealZoom, placeLift, OVERLAY_CX, OVERLAY_CY } from "./fx.mjs";

export const VIEW_W = constants.VIEW_W ?? 844;
export const VIEW_H = constants.VIEW_H ?? 390;

export const LEFT_X0 = constants.LEFT_X0 ?? 0;
export const LEFT_X1 = constants.LEFT_X1 ?? 400;
export const LEFT_Y0 = constants.LEFT_Y0 ?? 44;
export const LEFT_Y1 = constants.LEFT_Y1 ?? 390;

export const RIGHT_X0 = constants.RIGHT_X0 ?? 444;
export const RIGHT_X1 = constants.RIGHT_X1 ?? 844;
export const RIGHT_Y0 = constants.RIGHT_Y0 ?? 44;
export const RIGHT_Y1 = constants.RIGHT_Y1 ?? 390;
export const RIGHT_EDGE_SLACK = constants.RIGHT_EDGE_SLACK ?? 24;

export const BLADE_X = constants.BLADE_X ?? 400;
export const BLADE_Y = constants.BLADE_Y ?? 220;
export const GRIP_CX = constants.GRIP_CX ?? 188;
export const GRIP_CY = constants.GRIP_CY ?? 252;
export const GRIP_R = constants.GRIP_VISUAL_R ?? constants.GRIP_R ?? 124;
export const SAW_AXIS_X = constants.SAW_AXIS_X ?? constants.RIGHT_AXIS_X ?? 648;
export const BOARD_W = constants.BOARD_W ?? 280;
export const BOARD_H = constants.BOARD_H ?? 210;

export const THUMB_GUIDE_R = 22; // 直径 44wu

const WALL_A = "#e6ebe4";
const WALL_B = "#d8e0d4";
const BENCH_A = "#c4a06a";
const BENCH_B = "#b08958";
const BENCH_C = "#8a6840";
const IRON = "#5a6068";
const IRON_HI = "#8a9098";
const BLADE = "#c8ccd0";
const INK = "#1c2430";
const SAMPLE = "#3a3530";
const KERF = "#f7f0e4";
const HUD_BG = "#f3eee4";
const FONT = `"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif`;

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function clamp01(n) {
  return clamp(Number(n) || 0, 0, 1);
}

function rgba(hex, a) {
  const n = parseInt(String(hex || "#ffffff").replace("#", ""), 16);
  if (!Number.isFinite(n)) return `rgba(255, 255, 255, ${a})`;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

function u32(n) {
  return n >>> 0;
}

function hashSeed(state) {
  const s = String(state?.seed || state?.dateJst || "itonoko-sen");
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return u32(h);
}

/**
 * キャンバスを CSS サイズ × DPR に合わせ、描画は CSS ピクセル座標で行う。
 * @returns {{ cssW: number, cssH: number, dpr: number }}
 */
export function syncCanvasSize(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const cssW = Math.max(1, canvas.clientWidth || VIEW_W);
  const cssH = Math.max(1, canvas.clientHeight || VIEW_H);
  const w = Math.round(cssW * dpr);
  const h = Math.round(cssH * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  return { cssW, cssH, dpr };
}

/**
 * 高さに合わせて 844×390 を伸ばし、幅が足りなければ contain する。
 * 余った部分は同じ壁色で埋める。
 */
export function makeView(cssW, cssH) {
  let scale = cssH / VIEW_H;
  if (VIEW_W * scale > cssW + 0.5) scale = cssW / VIEW_W;
  const drawW = VIEW_W * scale;
  const drawH = VIEW_H * scale;
  const ox = (cssW - drawW) / 2;
  const oy = (cssH - drawH) / 2;
  return {
    scale,
    ox,
    oy,
    drawW,
    drawH,
    cssW,
    cssH,
    sx(x) {
      return ox + x * scale;
    },
    sy(y) {
      return oy + y * scale;
    },
    px(wu) {
      return wu * scale;
    },
    worldX(cssX) {
      return (cssX - ox) / scale;
    },
    worldY(cssY) {
      return (cssY - oy) / scale;
    },
  };
}

/**
 * クライアント座標をキャンバス論理座標（0..844, 0..390, Y 下向き）へ。
 * @returns {{ x: number, y: number }}
 */
export function clientToLogical(canvas, clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const cssW = canvas.clientWidth || rect.width || VIEW_W;
  const cssH = canvas.clientHeight || rect.height || VIEW_H;
  const view = makeView(cssW, cssH);
  const cssX = ((clientX - rect.left) / (rect.width || 1)) * cssW;
  const cssY = ((clientY - rect.top) / (rect.height || 1)) * cssH;
  return { x: view.worldX(cssX), y: view.worldY(cssY) };
}

export function inLeftZone(x, y) {
  return x >= LEFT_X0 && x <= LEFT_X1 && y >= LEFT_Y0 && y <= LEFT_Y1;
}

export function inRightZone(x, y, slack = 0) {
  return (
    x >= RIGHT_X0 - slack &&
    x <= RIGHT_X1 + slack &&
    y >= RIGHT_Y0 - slack &&
    y <= RIGHT_Y1 + slack
  );
}

export function boardPose(state) {
  let x = Number(state?.boardX);
  let y = Number(state?.boardY);
  let phi = Number(state?.boardPhi);
  if (!Number.isFinite(phi)) phi = 0;
  if (Number.isFinite(x) && Number.isFinite(y)) return { x, y, phi };
  const p0 = state?.params?.path?.[0];
  if (p0 && Number.isFinite(Number(p0.x)) && Number.isFinite(Number(p0.y))) {
    return { x: BLADE_X - Number(p0.x), y: BLADE_Y - Number(p0.y), phi: 0 };
  }
  return { x: BLADE_X, y: BLADE_Y, phi: 0 };
}

export function boardToTable(state, wx, wy, lift = 0) {
  const pose = boardPose(state);
  const c = Math.cos(pose.phi);
  const s = Math.sin(pose.phi);
  return {
    x: pose.x + wx * c - wy * s,
    y: pose.y + wx * s + wy * c - lift,
  };
}

function pathList(src) {
  if (!Array.isArray(src)) return [];
  const out = [];
  for (const p of src) {
    const x = Number(p?.x);
    const y = Number(p?.y);
    if (Number.isFinite(x) && Number.isFinite(y)) out.push({ x, y });
  }
  return out;
}

function pathBounds(path) {
  if (!path.length) {
    return { minX: -BOARD_W / 2, minY: -BOARD_H / 2, maxX: BOARD_W / 2, maxY: BOARD_H / 2 };
  }
  let minX = path[0].x;
  let minY = path[0].y;
  let maxX = path[0].x;
  let maxY = path[0].y;
  for (let i = 1; i < path.length; i++) {
    const p = path[i];
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

export function boardRect(state) {
  const params = state?.params || {};
  const path = pathList(params.path);
  const b = pathBounds(path);
  const pad = 18;
  let w = Number(params.boardW);
  let h = Number(params.boardH);
  if (!Number.isFinite(w) || w < 40) w = BOARD_W;
  if (!Number.isFinite(h) || h < 40) h = BOARD_H;
  w = Math.max(w, b.maxX - b.minX + pad * 2);
  h = Math.max(h, b.maxY - b.minY + pad * 2);
  let x0 = Number(params.boardX0);
  let y0 = Number(params.boardY0);
  if (Number.isFinite(x0) && Number.isFinite(y0)) return { x: x0, y: y0, w, h };
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

function woodColors(wood) {
  if (wood === "soft") {
    return { body: "#ead6a8", grain: "#d4ba86", edge: "#c4a06a", deep: "#b08958" };
  }
  if (wood === "firm") {
    return { body: "#cbb27e", grain: "#b08958", edge: "#8a6840", deep: "#6f5230" };
  }
  return { body: "#e2c99a", grain: "#c9ae78", edge: "#b08958", deep: "#8a6840" };
}

function applyBoardTransform(ctx, view, state, lift) {
  const pose = boardPose(state);
  const c = Math.cos(pose.phi);
  const s = Math.sin(pose.phi);
  const k = view.px(1);
  ctx.transform(k * c, k * s, k * -s, k * c, view.sx(pose.x), view.sy(pose.y - lift));
}

function fillWall(ctx, view) {
  const g = ctx.createLinearGradient(0, 0, 0, view.cssH);
  g.addColorStop(0, WALL_A);
  g.addColorStop(1, WALL_B);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, view.cssW, view.cssH);
}

function drawWindow(ctx, view) {
  const x = view.sx(210);
  const y = view.sy(-8);
  const w = view.px(260);
  const h = view.px(78);
  ctx.save();
  ctx.fillStyle = "#eef3ea";
  ctx.strokeStyle = rgba("#5a6068", 0.35);
  ctx.lineWidth = Math.max(1, view.px(2));
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, view.px(3));
  else ctx.rect(x, y, w, h);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = rgba("#5a6068", 0.28);
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y);
  ctx.lineTo(x + w / 2, y + h);
  ctx.moveTo(x, y + h * 0.55);
  ctx.lineTo(x + w, y + h * 0.55);
  ctx.stroke();
  ctx.fillStyle = rgba("#ffffff", 0.22);
  ctx.fillRect(x + view.px(8), y + view.px(8), view.px(70), view.px(18));
  ctx.restore();
}

function drawBench(ctx, view) {
  const top = view.sy(62);
  const left = view.sx(-20);
  const right = view.sx(VIEW_W + 20);
  const bottom = view.sy(VIEW_H + 20);
  const g = ctx.createLinearGradient(0, top, 0, bottom);
  g.addColorStop(0, BENCH_A);
  g.addColorStop(0.12, BENCH_B);
  g.addColorStop(1, BENCH_C);
  ctx.fillStyle = g;
  ctx.fillRect(left, top, right - left, bottom - top);
  ctx.fillStyle = rgba("#f3eee4", 0.16);
  ctx.fillRect(left, top, right - left, Math.max(2, view.px(3)));
  ctx.save();
  ctx.strokeStyle = rgba("#8a6840", 0.28);
  ctx.lineWidth = Math.max(1, view.px(1.2));
  for (let i = 1; i <= 5; i++) {
    const y = top + (bottom - top) * (i / 6);
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
  }
  ctx.restore();
}

function strokePoly(ctx, pts, closed) {
  if (!pts.length) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  if (closed) ctx.closePath();
}

function drawGrain(ctx, rect, colors, seed, wood) {
  const dense = wood === "firm" ? 18 : wood === "soft" ? 11 : 14;
  let a = u32(seed || 1);
  const rnd = () => {
    a = u32(Math.imul(a, 1664525) + 1013904223);
    return (a >>> 8) / 0x01000000;
  };
  ctx.save();
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 6);
  else ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();
  ctx.strokeStyle = rgba(colors.grain, 0.55);
  ctx.lineWidth = 1.1;
  ctx.lineCap = "round";
  const alongX = rect.w >= rect.h;
  for (let i = 0; i < dense; i++) {
    const t = (i + 0.4 + rnd() * 0.3) / dense;
    ctx.beginPath();
    if (alongX) {
      const y = rect.y + 4 + t * (rect.h - 8);
      const wob = 2 + rnd() * 3;
      ctx.moveTo(rect.x + 4, y + (rnd() - 0.5) * wob);
      ctx.bezierCurveTo(
        rect.x + rect.w * 0.35,
        y + (rnd() - 0.5) * wob * 2,
        rect.x + rect.w * 0.7,
        y + (rnd() - 0.5) * wob * 2,
        rect.x + rect.w - 4,
        y + (rnd() - 0.5) * wob,
      );
    } else {
      const x = rect.x + 4 + t * (rect.w - 8);
      const wob = 2 + rnd() * 3;
      ctx.moveTo(x + (rnd() - 0.5) * wob, rect.y + 4);
      ctx.bezierCurveTo(
        x + (rnd() - 0.5) * wob * 2,
        rect.y + rect.h * 0.35,
        x + (rnd() - 0.5) * wob * 2,
        rect.y + rect.h * 0.7,
        x + (rnd() - 0.5) * wob,
        rect.y + rect.h - 4,
      );
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawNotch(ctx, path, rect) {
  const p0 = path[0];
  if (!p0) return;
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const left = p0.x - rect.x;
  const right = rect.x + rect.w - p0.x;
  const top = p0.y - rect.y;
  const bot = rect.y + rect.h - p0.y;
  const m = Math.min(left, right, top, bot);
  let ex = p0.x;
  let ey = p0.y;
  if (m === left) ex = rect.x - 1;
  else if (m === right) ex = rect.x + rect.w + 1;
  else if (m === top) ey = rect.y - 1;
  else ey = rect.y + rect.h + 1;
  const nx = p0.y - cy;
  const ny = cx - p0.x;
  const nlen = Math.hypot(nx, ny) || 1;
  const ox = (nx / nlen) * 5;
  const oy = (ny / nlen) * 5;
  ctx.beginPath();
  ctx.moveTo(ex + ox, ey + oy);
  ctx.lineTo(p0.x, p0.y);
  ctx.lineTo(ex - ox, ey - oy);
  ctx.closePath();
  ctx.fillStyle = KERF;
  ctx.fill();
  ctx.strokeStyle = rgba("#5a4a38", 0.45);
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawPencilPath(ctx, path) {
  if (path.length < 2) return;
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = rgba(SAMPLE, 0.5);
  ctx.lineWidth = 2.6;
  strokePoly(ctx, path, false);
  ctx.stroke();
  ctx.strokeStyle = rgba(SAMPLE, 0.72);
  ctx.lineWidth = 1.15;
  ctx.stroke();
  ctx.restore();
}

function drawKerf(ctx, kerf, torn) {
  if (!kerf || kerf.length < 2) return;
  ctx.save();
  ctx.lineJoin = torn ? "bevel" : "round";
  ctx.lineCap = "round";
  // A slightly offset shade so the pale gap reads as a cut, not a second pencil stroke.
  ctx.strokeStyle = rgba("#2a2018", torn ? 0.5 : 0.38);
  ctx.lineWidth = torn ? 5.4 : 5;
  ctx.translate(0.55, 0.7);
  strokePoly(ctx, kerf, false);
  ctx.stroke();
  ctx.translate(-0.55, -0.7);
  ctx.strokeStyle = rgba("#4a3c2c", torn ? 0.9 : 0.8);
  ctx.lineWidth = torn ? 4.8 : 4.3;
  strokePoly(ctx, kerf, false);
  ctx.stroke();
  ctx.strokeStyle = KERF;
  ctx.lineWidth = 2.2;
  ctx.stroke();
  ctx.restore();
}

function drawBoard(ctx, view, state, lift) {
  const path = pathList(state?.params?.path);
  const kerf = pathList(state?.kerf);
  const rect = boardRect(state);
  const colors = woodColors(state?.params?.wood);
  const torn = (Number(state?.tearCount) || 0) > 0;

  ctx.save();
  applyBoardTransform(ctx, view, state, lift);

  // 影
  ctx.fillStyle = rgba("#1c2430", 0.18);
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(rect.x + 3, rect.y + 4, rect.w, rect.h, 6);
    ctx.fill();
  } else {
    ctx.fillRect(rect.x + 3, rect.y + 4, rect.w, rect.h);
  }

  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 6);
  else ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.fillStyle = colors.body;
  ctx.fill();
  ctx.strokeStyle = colors.edge;
  ctx.lineWidth = 1.6;
  ctx.stroke();

  drawGrain(ctx, rect, colors, hashSeed(state), state?.params?.wood);
  drawNotch(ctx, path, rect);
  drawPencilPath(ctx, path);
  drawKerf(ctx, kerf, torn);
  ctx.restore();
}

/** Pencil line and kerf in board space. Drawn again after the grab disk so the line stays readable. */
function drawBoardLines(ctx, view, state, lift) {
  const path = pathList(state?.params?.path);
  const kerf = pathList(state?.kerf);
  const torn = (Number(state?.tearCount) || 0) > 0;
  ctx.save();
  applyBoardTransform(ctx, view, state, lift);
  drawPencilPath(ctx, path);
  drawKerf(ctx, kerf, torn);
  ctx.restore();
}

function drawGrabDisk(ctx, view) {
  const cx = view.sx(GRIP_CX);
  const cy = view.sy(GRIP_CY);
  const r = view.px(GRIP_R);
  ctx.save();
  const g = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r);
  g.addColorStop(0, rgba("#d8c4a0", 0.28));
  g.addColorStop(0.7, rgba("#b08958", 0.2));
  g.addColorStop(1, rgba("#8a6840", 0.38));
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = rgba(IRON, 0.55);
  ctx.lineWidth = Math.max(1.6, view.px(2.2));
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, view.px(16), 0, Math.PI * 2);
  ctx.fillStyle = rgba("#8a6840", 0.7);
  ctx.fill();
  ctx.strokeStyle = rgba(IRON_HI, 0.7);
  ctx.lineWidth = Math.max(1, view.px(1.2));
  ctx.stroke();
  ctx.strokeStyle = rgba(INK, 0.18);
  ctx.lineWidth = Math.max(1, view.px(1));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r * 0.72, cy + Math.sin(a) * r * 0.72);
    ctx.lineTo(cx + Math.cos(a) * r * 0.92, cy + Math.sin(a) * r * 0.92);
    ctx.stroke();
  }
  ctx.restore();
}

function drawFeedChevron(ctx, view) {
  const cx = view.sx(GRIP_CX);
  const cy = view.sy(GRIP_CY);
  const r = view.px(GRIP_R);
  ctx.save();
  ctx.strokeStyle = rgba(INK, 0.5);
  ctx.lineWidth = Math.max(1.8, view.px(2.2));
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const tipY = cy - r * 0.48;
  const barY = cy - r * 0.32;
  ctx.beginPath();
  ctx.moveTo(cx - view.px(9), barY);
  ctx.lineTo(cx, tipY);
  ctx.lineTo(cx + view.px(9), barY);
  ctx.stroke();
  ctx.restore();
}

function handleYFrom(fx, right) {
  const stroke = Number(fx?.stroke);
  if (Number.isFinite(stroke)) return clamp(BLADE_Y + stroke, RIGHT_Y0 + 36, RIGHT_Y1 - 36);
  if (right?.active && Number.isFinite(right.y)) {
    return clamp(right.y, RIGHT_Y0 + 36, RIGHT_Y1 - 36);
  }
  return BLADE_Y;
}

function drawSawFrame(ctx, view, state, fx, right) {
  const hy = handleYFrom(fx, right);
  const hx = SAW_AXIS_X;
  const topY = hy - 46;
  const botY = hy + 40;
  const clampX = BLADE_X + 10;
  const clampTop = BLADE_Y - 90;
  const clampBot = BLADE_Y + 8;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = IRON;
  ctx.lineWidth = Math.max(3.2, view.px(5));
  ctx.beginPath();
  ctx.moveTo(view.sx(hx - 10), view.sy(topY));
  ctx.bezierCurveTo(
    view.sx((hx + clampX) / 2 + 20),
    view.sy(topY - 16),
    view.sx((hx + clampX) / 2 - 10),
    view.sy(clampTop - 8),
    view.sx(clampX),
    view.sy(clampTop),
  );
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(view.sx(hx - 10), view.sy(botY));
  ctx.bezierCurveTo(
    view.sx((hx + clampX) / 2 + 24),
    view.sy(botY + 10),
    view.sx((hx + clampX) / 2),
    view.sy(clampBot + 6),
    view.sx(clampX),
    view.sy(clampBot),
  );
  ctx.stroke();
  ctx.strokeStyle = IRON_HI;
  ctx.lineWidth = Math.max(1.2, view.px(1.6));
  ctx.beginPath();
  ctx.moveTo(view.sx(hx - 10), view.sy(topY - 2));
  ctx.bezierCurveTo(
    view.sx((hx + clampX) / 2 + 20),
    view.sy(topY - 18),
    view.sx((hx + clampX) / 2 - 10),
    view.sy(clampTop - 10),
    view.sx(clampX),
    view.sy(clampTop - 2),
  );
  ctx.stroke();

  // 柄
  const hw = view.px(18);
  const hh = view.px(78);
  const hxS = view.sx(hx) - hw / 2;
  const hyS = view.sy(hy) - hh / 2;
  ctx.fillStyle = "#8a6840";
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(hxS, hyS, hw, hh, view.px(5));
    ctx.fill();
  } else {
    ctx.fillRect(hxS, hyS, hw, hh);
  }
  ctx.strokeStyle = rgba("#5a3e24", 0.7);
  ctx.lineWidth = Math.max(1, view.px(1.1));
  ctx.stroke();
  ctx.fillStyle = rgba("#c4a06a", 0.45);
  ctx.fillRect(hxS + view.px(3), hyS + view.px(8), view.px(4), hh - view.px(16));

  // 刃の留め
  for (const cy of [clampTop, clampBot]) {
    ctx.beginPath();
    ctx.arc(view.sx(BLADE_X), view.sy(cy), view.px(4.5), 0, Math.PI * 2);
    ctx.fillStyle = IRON;
    ctx.fill();
    ctx.strokeStyle = IRON_HI;
    ctx.lineWidth = Math.max(1, view.px(1));
    ctx.stroke();
  }
  ctx.restore();
}

function bladeCurve(bend, snapped, stroke) {
  const top = { x: BLADE_X, y: BLADE_Y - 90 };
  const bot = { x: BLADE_X, y: BLADE_Y };
  const midY = (top.y + bot.y) / 2 + (Number(stroke) || 0) * 0.04;
  const defl = (Number(bend) || 0) * 22;
  const mid = { x: BLADE_X + defl, y: midY };
  if (!snapped) return { top, mid, bot, snapped: false };
  return {
    top,
    mid: { x: BLADE_X + 10 + defl * 0.4, y: midY - 6 },
    breakAt: { x: BLADE_X + 6, y: midY + 4 },
    stub: { x: BLADE_X + defl * 0.15, y: BLADE_Y - 8 },
    bot,
    snapped: true,
  };
}

function strokeBlade(ctx, view, curve, width, color, alpha, dash) {
  ctx.save();
  ctx.strokeStyle = rgba(color, alpha);
  ctx.lineWidth = Math.max(1, view.px(width));
  ctx.lineCap = "round";
  ctx.setLineDash(dash ? [view.px(3), view.px(2.2)] : []);
  ctx.beginPath();
  if (curve.snapped) {
    ctx.moveTo(view.sx(curve.top.x), view.sy(curve.top.y));
    ctx.quadraticCurveTo(view.sx(curve.mid.x), view.sy(curve.mid.y), view.sx(curve.breakAt.x), view.sy(curve.breakAt.y));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(view.sx(curve.stub.x), view.sy(curve.stub.y));
    ctx.lineTo(view.sx(curve.bot.x), view.sy(curve.bot.y));
    ctx.stroke();
  } else {
    ctx.moveTo(view.sx(curve.top.x), view.sy(curve.top.y));
    ctx.quadraticCurveTo(view.sx(curve.mid.x), view.sy(curve.mid.y), view.sx(curve.bot.x), view.sy(curve.bot.y));
    ctx.stroke();
  }
  ctx.restore();
}

function drawBlade(ctx, view, state, fx, reduced) {
  const bend = Number(state?.bend) || 0;
  const snapped = !!state?.snapped;
  const stroke = Number(fx?.stroke) || 0;
  if (fx?.trails?.length && !reduced && !snapped) {
    for (const tr of fx.trails) {
      const u = Math.max(0, Math.min(1, tr.life / (tr.max || 0.16)));
      const c = bladeCurve(tr.bend, false, tr.stroke);
      strokeBlade(ctx, view, c, 1.4, BLADE, 0.12 * u, false);
    }
  }
  const curve = bladeCurve(bend, snapped, stroke);
  strokeBlade(ctx, view, curve, 2.4, "#8a9098", 0.9, false);
  strokeBlade(ctx, view, curve, 1.5, BLADE, 1, false);
  const sawRate = Number(state?.right?.sawRate) || 0;
  const cutting = state?.phase === "cut" && !snapped && sawRate > 0.8;
  if (cutting) {
    const t = ((Number(fx?.clock) || 0) * 3.2 + stroke * 0.02) % 1;
    const y = BLADE_Y - 90 + 70 * t;
    ctx.save();
    ctx.strokeStyle = rgba("#ffffff", 0.7);
    ctx.lineWidth = Math.max(1, view.px(1.1));
    ctx.lineCap = "round";
    ctx.beginPath();
    const x = BLADE_X + bend * 11;
    ctx.moveTo(view.sx(x), view.sy(y));
    ctx.lineTo(view.sx(x), view.sy(y + 10));
    ctx.stroke();
    ctx.restore();
  }
}

function leftThumbPos(left) {
  const cx = GRIP_CX;
  const cy = GRIP_CY;
  if (left?.active && Number.isFinite(left.x) && Number.isFinite(left.y)) {
    const dx = left.x - cx;
    const dy = left.y - cy;
    const d = Math.hypot(dx, dy) || 1;
    const r = clamp(d, 28, GRIP_R - 10);
    return { x: cx + (dx / d) * r, y: cy + (dy / d) * r, active: true };
  }
  return { x: cx - 8, y: cy + 42, active: false };
}

function rightThumbPos(right, fx) {
  const hy = handleYFrom(fx, right);
  if (right?.active && Number.isFinite(right.x) && Number.isFinite(right.y)) {
    return {
      x: clamp(right.x, SAW_AXIS_X - 20, Math.min(RIGHT_X1 - 10, SAW_AXIS_X + 36)),
      y: clamp(right.y, RIGHT_Y0 + 8, RIGHT_Y1 - 8),
      active: true,
    };
  }
  return { x: SAW_AXIS_X + 10, y: hy, active: false };
}

function drawThumbGuide(ctx, view, x, y, active, hint) {
  const r = view.px(THUMB_GUIDE_R);
  const cx = view.sx(x);
  const cy = view.sy(y);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = rgba(HUD_BG, active ? 0.42 : hint ? 0.34 : 0.2);
  ctx.fill();
  ctx.strokeStyle = rgba(INK, active ? 0.64 : hint ? 0.52 : 0.34);
  ctx.lineWidth = Math.max(1.5, view.px(1.8));
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.22, 0, Math.PI * 2);
  ctx.fillStyle = rgba(INK, active ? 0.36 : 0.2);
  ctx.fill();
  ctx.restore();
}

function fitPath(path, box, pad = 10) {
  const b = pathBounds(path.length ? path : [{ x: 0, y: 0 }]);
  const w = Math.max(8, b.maxX - b.minX);
  const h = Math.max(8, b.maxY - b.minY);
  const innerW = box.w - pad * 2;
  const innerH = box.h - pad * 2;
  const scale = Math.min(innerW / w, innerH / h);
  const ox = box.x + pad + (innerW - w * scale) / 2;
  const oy = box.y + pad + (innerH - h * scale) / 2;
  return {
    map(p) {
      return { x: ox + (p.x - b.minX) * scale, y: oy + (p.y - b.minY) * scale };
    },
    scale,
  };
}

function drawMappedPoly(ctx, path, map, color, width, alpha) {
  if (path.length < 2) return;
  ctx.beginPath();
  const p0 = map(path[0]);
  ctx.moveTo(p0.x, p0.y);
  for (let i = 1; i < path.length; i++) {
    const p = map(path[i]);
    ctx.lineTo(p.x, p.y);
  }
  ctx.strokeStyle = rgba(color, alpha);
  ctx.lineWidth = width;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();
}

function drawMinimap(ctx, view, state) {
  const box = { x: 14, y: 52, w: 116, h: 88 };
  const x = view.sx(box.x);
  const y = view.sy(box.y);
  const w = view.px(box.w);
  const h = view.px(box.h);
  ctx.save();
  ctx.fillStyle = rgba(HUD_BG, 0.92);
  ctx.strokeStyle = rgba(INK, 0.22);
  ctx.lineWidth = Math.max(1, view.px(1));
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, 5);
  else ctx.rect(x, y, w, h);
  ctx.fill();
  ctx.stroke();

  ctx.font = `700 ${Math.max(10, view.px(11))}px ${FONT}`;
  ctx.fillStyle = INK;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText("線", x + view.px(6), y + view.px(4));

  const path = pathList(state?.params?.path);
  const kerf = pathList(state?.kerf);
  const all = path.concat(kerf);
  const inner = { x: x + view.px(6), y: y + view.px(18), w: w - view.px(12), h: h - view.px(24) };
  const fit = fitPath(all, inner, 2);
  ctx.save();
  ctx.beginPath();
  ctx.rect(inner.x, inner.y, inner.w, inner.h);
  ctx.clip();
  drawMappedPoly(ctx, path, (p) => fit.map(p), SAMPLE, Math.max(1.3, view.px(1.6)), 0.85);
  if (kerf.length > 1) {
    drawMappedPoly(ctx, kerf, (p) => fit.map(p), "#4a3c2c", Math.max(2.2, view.px(2.8)), 0.85);
    drawMappedPoly(ctx, kerf, (p) => fit.map(p), "#e2d3b8", Math.max(1.1, view.px(1.35)), 1);
  }
  const wx = Number(state?.bladeWx);
  const wy = Number(state?.bladeWy);
  if (Number.isFinite(wx) && Number.isFinite(wy) && path.length) {
    const bp = fit.map({ x: wx, y: wy });
    ctx.beginPath();
    ctx.arc(bp.x, bp.y, Math.max(2.2, view.px(2.6)), 0, Math.PI * 2);
    ctx.fillStyle = IRON;
    ctx.fill();
  }
  ctx.restore();
  ctx.restore();
}

function drawRevealOverlay(ctx, view, state) {
  const path = pathList(state?.params?.path);
  const kerf = pathList(state?.kerf);
  const box = { x: OVERLAY_CX - 150, y: OVERLAY_CY - 86, w: 300, h: 176 };
  const x = view.sx(box.x);
  const y = view.sy(box.y);
  const w = view.px(box.w);
  const h = view.px(box.h);
  const colors = woodColors(state?.params?.wood);
  ctx.save();
  ctx.fillStyle = rgba(HUD_BG, 0.16);
  ctx.fillRect(view.sx(0), view.sy(0), view.px(VIEW_W), view.px(VIEW_H));
  ctx.fillStyle = colors.body;
  ctx.strokeStyle = colors.edge;
  ctx.lineWidth = Math.max(1.2, view.px(1.4));
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, 8);
  else ctx.rect(x, y, w, h);
  ctx.fill();
  ctx.stroke();
  const inner = { x: x + view.px(16), y: y + view.px(14), w: w - view.px(32), h: h - view.px(28) };
  const fit = fitPath(path.concat(kerf), inner, 4);
  drawMappedPoly(ctx, path, (p) => fit.map(p), SAMPLE, Math.max(2, view.px(2.4)), 0.7);
  if (kerf.length > 1) {
    drawMappedPoly(ctx, kerf, (p) => fit.map(p), "#4a3c2c", Math.max(3.6, view.px(4.2)), 0.85);
    drawMappedPoly(ctx, kerf, (p) => fit.map(p), KERF, Math.max(2, view.px(2.2)), 1);
  }
  ctx.restore();
}

function fillArrowHead(ctx, x, y, angle, size) {
  const ax = Math.cos(angle);
  const ay = Math.sin(angle);
  const px = -ay;
  const py = ax;
  const back = size;
  const half = size * 0.58;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - ax * back + px * half, y - ay * back + py * half);
  ctx.lineTo(x - ax * back - px * half, y - ay * back - py * half);
  ctx.closePath();
  ctx.fill();
}

function drawGhostDot(ctx, view, x, y, alpha, radius = 16) {
  const r = view.px(radius);
  const cx = view.sx(x);
  const cy = view.sy(y);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = rgba(HUD_BG, 0.28 * alpha);
  ctx.fill();
  ctx.strokeStyle = rgba(INK, 0.5 * alpha);
  ctx.lineWidth = Math.max(1.4, view.px(1.7));
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.22, 0, Math.PI * 2);
  ctx.fillStyle = rgba(INK, 0.32 * alpha);
  ctx.fill();
  ctx.restore();
}

function drawVerticalDoubleArrow(ctx, view, x, y0, y1, alpha, headWu = 11) {
  const sx = view.sx(x);
  const top = view.sy(Math.min(y0, y1));
  const bot = view.sy(Math.max(y0, y1));
  const head = view.px(headWu);
  ctx.save();
  ctx.strokeStyle = rgba(INK, 0.48 * alpha);
  ctx.fillStyle = rgba(INK, 0.48 * alpha);
  ctx.lineWidth = Math.max(1.8, view.px(2.2));
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(sx, top + head * 0.7);
  ctx.lineTo(sx, bot - head * 0.7);
  ctx.stroke();
  fillArrowHead(ctx, sx, top, -Math.PI / 2, head);
  fillArrowHead(ctx, sx, bot, Math.PI / 2, head);
  ctx.restore();
}

function drawUpArrow(ctx, view, x, y0, y1, alpha, headWu = 11) {
  const sx = view.sx(x);
  const from = view.sy(y0);
  const to = view.sy(y1);
  const head = view.px(headWu);
  ctx.save();
  ctx.strokeStyle = rgba(INK, 0.5 * alpha);
  ctx.fillStyle = rgba(INK, 0.5 * alpha);
  ctx.lineWidth = Math.max(1.8, view.px(2.2));
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(sx, from);
  ctx.lineTo(sx, to + head * 0.55);
  ctx.stroke();
  fillArrowHead(ctx, sx, to, -Math.PI / 2, head);
  ctx.restore();
}

function drawArcArrow(ctx, view, cx, cy, r, a0, a1, alpha, headWu = 10) {
  const x = view.sx(cx);
  const y = view.sy(cy);
  const pr = view.px(r);
  const head = view.px(headWu);
  const anticlockwise = a1 < a0;
  ctx.save();
  ctx.strokeStyle = rgba(INK, 0.5 * alpha);
  ctx.fillStyle = rgba(INK, 0.5 * alpha);
  ctx.lineWidth = Math.max(1.8, view.px(2.2));
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(x, y, pr, a0, a1, anticlockwise);
  ctx.stroke();
  const ex = x + Math.cos(a1) * pr;
  const ey = y + Math.sin(a1) * pr;
  // Tangent: canvas angles increase clockwise visually (Y down).
  const tangent = a1 + (anticlockwise ? -Math.PI / 2 : Math.PI / 2);
  fillArrowHead(ctx, ex, ey, tangent, head);
  ctx.restore();
}

function easeInOut(t) {
  const u = clamp01(t);
  return u * u * (3 - 2 * u);
}

/**
 * 初回操作までの案内。hintLeft / hintRight と同じタイミング。
 * 線と刃は覆わない（左は掴み盤の中、右は刃から離れた上下の軸のそば）。
 */
function drawMotionGuides(ctx, view, state, fx, reduced) {
  const clock = Number(fx?.clock) || 0;
  const leftOn = !!state?.hintLeft;
  const rightOn = !!state?.hintRight;
  if (!leftOn && !rightOn) return;

  if (leftOn) {
    const cx = GRIP_CX;
    const cy = GRIP_CY;
    const r = GRIP_R;
    const tipY = cy - r * 0.52;
    drawUpArrow(ctx, view, cx, cy - 8, tipY, 1);
    // 盤の上側を大きく回る弧。刃（x=400）には届かない。
    const arcR = r * 0.68;
    drawArcArrow(ctx, view, cx, cy, arcR, -Math.PI * 0.15, Math.PI * 1.45, 1);
    if (reduced) {
      drawGhostDot(ctx, view, cx, (cy + tipY) / 2, 0.9);
      const a = Math.PI * 0.35;
      drawGhostDot(ctx, view, cx + Math.cos(a) * arcR, cy + Math.sin(a) * arcR, 0.9);
    } else {
      const period = 3.2;
      const u = (clock % period) / period;
      let gx;
      let gy;
      let ga = 1;
      if (u < 0.38) {
        const k = easeInOut(u / 0.38);
        gx = cx;
        gy = cy - 4 + (tipY - (cy - 4)) * k;
      } else if (u < 0.86) {
        const k = (u - 0.38) / 0.48;
        const a0 = -Math.PI / 2;
        const a = a0 + k * Math.PI * 2;
        gx = cx + Math.cos(a) * arcR;
        gy = cy + Math.sin(a) * arcR;
      } else {
        const k = easeInOut((u - 0.86) / 0.14);
        gx = cx;
        gy = tipY + ((cy - 4) - tipY) * k;
        ga = 1 - 0.15 * k;
      }
      drawGhostDot(ctx, view, gx, gy, ga);
    }
  }

  if (rightOn) {
    const x = SAW_AXIS_X + 26;
    const y0 = 108;
    const y1 = 332;
    drawVerticalDoubleArrow(ctx, view, x, y0, y1, 1);
    let gy;
    if (reduced) {
      gy = (y0 + y1) / 2;
    } else {
      const period = 1.6;
      const k = (1 - Math.cos(((clock % period) / period) * Math.PI * 2)) / 2;
      gy = y0 + 18 + (y1 - y0 - 36) * k;
    }
    drawGhostDot(ctx, view, x, gy, 1);
  }
}

function setupCssCanvas(canvas, fallbackW, fallbackH) {
  if (!canvas || typeof canvas.getContext !== "function") return null;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return null;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cssW = Math.max(1, canvas.clientWidth || fallbackW);
  const cssH = Math.max(1, canvas.clientHeight || fallbackH);
  const w = Math.round(cssW * dpr);
  const h = Math.round(cssH * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, cssW, cssH };
}

function drawTitleGuideIcons(ctx, cssW, cssH) {
  // Logical 320×80, then scale to the CSS box.
  const scale = Math.min(cssW / 320, cssH / 80);
  const ox = (cssW - 320 * scale) / 2;
  const oy = (cssH - 80 * scale) / 2;
  const view = {
    sx(x) {
      return ox + x * scale;
    },
    sy(y) {
      return oy + y * scale;
    },
    px(wu) {
      return wu * scale;
    },
  };
  ctx.save();
  ctx.fillStyle = HUD_BG;
  ctx.fillRect(0, 0, cssW, cssH);

  // Left: grab disc, up arrow, circular arrow.
  const lcx = 78;
  const lcy = 40;
  const lr = 28;
  ctx.beginPath();
  ctx.arc(view.sx(lcx), view.sy(lcy), view.px(lr), 0, Math.PI * 2);
  ctx.fillStyle = rgba("#d8c4a0", 0.7);
  ctx.fill();
  ctx.strokeStyle = rgba(IRON, 0.55);
  ctx.lineWidth = Math.max(1, view.px(1.6));
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(view.sx(lcx), view.sy(lcy), view.px(4.5), 0, Math.PI * 2);
  ctx.fillStyle = rgba("#8a6840", 0.8);
  ctx.fill();
  drawUpArrow(ctx, view, lcx, lcy - 2, lcy - lr * 0.92, 1.15, 7);
  drawArcArrow(ctx, view, lcx, lcy, lr * 0.78, -Math.PI * 0.2, Math.PI * 1.4, 1.15, 6.5);
  drawGhostDot(ctx, view, lcx, lcy - lr * 0.45, 0.95, 6.5);
  const la = Math.PI * 0.35;
  drawGhostDot(ctx, view, lcx + Math.cos(la) * lr * 0.78, lcy + Math.sin(la) * lr * 0.78, 0.95, 6.5);

  // Divider
  ctx.beginPath();
  ctx.strokeStyle = rgba(INK, 0.16);
  ctx.lineWidth = Math.max(1, view.px(1));
  ctx.moveTo(view.sx(160), view.sy(12));
  ctx.lineTo(view.sx(160), view.sy(68));
  ctx.stroke();

  // Right: vertical double arrow and thumb.
  const rx = 236;
  drawVerticalDoubleArrow(ctx, view, rx, 10, 70, 1.15, 7);
  drawGhostDot(ctx, view, rx, 40, 0.95, 6.5);
  ctx.restore();
}

/**
 * タイトルの線の縮小図。種類名は出さない。
 * @param {HTMLCanvasElement} canvas
 * @param {object} state
 */
export function drawTitlePreview(canvas, state) {
  if (!canvas || typeof canvas.getContext !== "function") return;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cssW = Math.max(1, canvas.clientWidth || 240);
  const cssH = Math.max(1, canvas.clientHeight || 160);
  const w = Math.round(cssW * dpr);
  const h = Math.round(cssH * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = HUD_BG;
  ctx.fillRect(0, 0, cssW, cssH);
  const path = pathList(state?.params?.path);
  const colors = woodColors(state?.params?.wood);
  const inset = 10;
  ctx.fillStyle = colors.body;
  ctx.strokeStyle = colors.edge;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(inset, inset, cssW - inset * 2, cssH - inset * 2, 6);
  else ctx.rect(inset, inset, cssW - inset * 2, cssH - inset * 2);
  ctx.fill();
  ctx.stroke();
  if (path.length >= 2) {
    const box = { x: inset + 8, y: inset + 8, w: cssW - (inset + 8) * 2, h: cssH - (inset + 8) * 2 };
    const fit = fitPath(path, box, 2);
    drawMappedPoly(ctx, path, (p) => fit.map(p), SAMPLE, 2.2, 0.82);
  }
}

/**
 * タイトルの操作案内（静止図）。
 * @param {HTMLCanvasElement} canvas
 */
export function drawTitleGuides(canvas) {
  const setup = setupCssCanvas(canvas, 320, 80);
  if (!setup) return;
  drawTitleGuideIcons(setup.ctx, setup.cssW, setup.cssH);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} state
 * @param {{ reducedMotion?: boolean, fx?: object, left?: object, right?: object }} [opts]
 */
export function drawScene(ctx, state, opts = {}) {
  const canvas = ctx.canvas;
  const { cssW, cssH, dpr } = syncCanvasSize(canvas);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const base = makeView(cssW, cssH);
  const reduced = !!opts.reducedMotion;
  const fx = opts.fx;
  const zoom = revealZoom(fx, reduced);
  const focusX = BLADE_X;
  const focusY = BLADE_Y;
  const view =
    zoom === 1
      ? base
      : {
          ...base,
          sx(x) {
            return base.sx(focusX + (x - focusX) * zoom);
          },
          sy(y) {
            return base.sy(focusY + (y - focusY) * zoom);
          },
          px(wu) {
            return base.px(wu * zoom);
          },
        };

  fillWall(ctx, base);
  drawWindow(ctx, view);
  drawBench(ctx, view);

  const lift = placeLift(state, fx, reduced);
  const playing = state?.status === "playing";
  const phase = state?.phase;
  const showBoard = !!(state?.params?.path || Number.isFinite(state?.boardX));

  if (showBoard) drawBoard(ctx, view, state, lift);

  const showTools = playing || state?.status === "title" || state?.status === "over";
  if (showTools) drawGrabDisk(ctx, view);
  // Line and kerf sit above the grab disk so the sample stays readable where they overlap.
  if (showBoard) drawBoardLines(ctx, view, state, lift);
  if (showTools) drawFeedChevron(ctx, view);
  if (showTools) drawSawFrame(ctx, view, state, fx, opts.right);

  const leftPos = leftThumbPos(opts.left);
  const rightPos = rightThumbPos(opts.right, fx);
  const showGuides = playing && (phase === "set" || phase === "cut");
  if (showGuides) {
    drawThumbGuide(ctx, view, leftPos.x, leftPos.y, leftPos.active, !!state?.hintLeft);
    drawThumbGuide(ctx, view, rightPos.x, rightPos.y, rightPos.active, !!state?.hintRight);
    drawMotionGuides(ctx, view, state, fx, reduced);
  }

  // Screen-fixed, unzoomed. Hidden during reveal so the overlay is the comparison.
  if (playing && phase !== "reveal") drawMinimap(ctx, base, state);

  // 刃と今の線は指より手前
  if (showTools) drawBlade(ctx, view, state, fx, reduced);
  if (showBoard && (playing || state?.status === "over")) {
    // 今切っている線（刃まわりの見本）を手前に短く強調
    const path = pathList(state?.params?.path);
    if (path.length >= 2 && phase !== "reveal" && state?.status !== "over") {
      ctx.save();
      applyBoardTransform(ctx, view, state, lift);
      ctx.strokeStyle = rgba(SAMPLE, 0.85);
      ctx.lineWidth = 1.4;
      ctx.lineCap = "round";
      const bx = Number(state?.bladeWx);
      const by = Number(state?.bladeWy);
      if (Number.isFinite(bx) && Number.isFinite(by)) {
        // 刃の近くだけをなぞる
        ctx.beginPath();
        let started = false;
        for (const p of path) {
          if (Math.hypot(p.x - bx, p.y - by) <= 28) {
            if (!started) {
              ctx.moveTo(p.x, p.y);
              started = true;
            } else ctx.lineTo(p.x, p.y);
          } else if (started) {
            break;
          }
        }
        if (started) ctx.stroke();
      }
      ctx.restore();
    }
  }

  if ((playing && phase === "reveal") || state?.status === "over") {
    drawRevealOverlay(ctx, view, state);
  }

  drawFx(ctx, fx, { ...view, reducedMotion: reduced }, state);
}
