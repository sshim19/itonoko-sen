/** dailyParams(rngState) → { params, rngState }. Idempotent daily line. */

import {
  BOARD_H,
  BOARD_MARGIN,
  BOARD_W,
  CORNER_DEG_MAX,
  CORNER_DEG_MIN,
  CORNER_R_MAX,
  CORNER_R_MIN,
  FAMILIES,
  PATH_LEN_MAX,
  PATH_LEN_MIN,
  PATH_SPACING,
  WOOD_TABLE,
  clamp,
} from "./constants.mjs";
import { pathLength, resamplePath } from "./cut.mjs";
import { rngRange, rngStep } from "./rng.mjs";

const JITTER_COUNT = 8;

function pickRow(a, table) {
  const step = rngStep(a);
  const i = Math.min(table.length - 1, Math.floor(step.value * table.length));
  return { row: table[i], a: step.a };
}

function pickFamily(a) {
  const step = rngStep(a);
  const i = Math.min(FAMILIES.length - 1, Math.floor(step.value * FAMILIES.length));
  return { family: FAMILIES[i], a: step.a };
}

function norm(v) {
  const l = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / l, y: v.y / l };
}

function add(a, b, s = 1) {
  return { x: a.x + b.x * s, y: a.y + b.y * s };
}

function tangentOf(pts, i) {
  const a = pts[Math.max(0, i - 1)];
  const b = pts[Math.min(pts.length - 1, i + 1)];
  return norm({ x: b.x - a.x, y: b.y - a.y });
}

function sampleArc(p, tangent, radius, deg, spacing = 1.2) {
  const t = norm(tangent);
  const r = Math.max(1, Number(radius) || 1);
  const sweep = (Number(deg) * Math.PI) / 180;
  if (Math.abs(sweep) < 1e-6) return { points: [], end: p, tangent: t };
  const s = Math.sign(sweep) || 1;
  const c = { x: p.x - s * r * t.y, y: p.y + s * r * t.x };
  const start = Math.atan2(p.y - c.y, p.x - c.x);
  const arcLen = Math.abs(r * sweep);
  const n = Math.max(4, Math.round(arcLen / spacing));
  const points = [];
  for (let i = 1; i <= n; i++) {
    const a = start + sweep * (i / n);
    points.push({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) });
  }
  const end = points[points.length - 1];
  const heading = start + sweep + (s > 0 ? Math.PI / 2 : -Math.PI / 2);
  // Incoming tangent at the start is t. Outgoing is t rotated by sweep.
  const endT = {
    x: t.x * Math.cos(sweep) - t.y * Math.sin(sweep),
    y: t.x * Math.sin(sweep) + t.y * Math.cos(sweep),
  };
  return { points, end, tangent: norm(endT), heading };
}

function sampleQuad(p0, p1, p2, spacing = 1.2) {
  const approx = Math.hypot(p1.x - p0.x, p1.y - p0.y) + Math.hypot(p2.x - p1.x, p2.y - p1.y);
  const n = Math.max(4, Math.round(approx / spacing));
  const out = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push({
      x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
      y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
    });
  }
  return out;
}

function sampleCubic(p0, p1, p2, p3, spacing = 1.2) {
  const approx =
    Math.hypot(p1.x - p0.x, p1.y - p0.y) +
    Math.hypot(p2.x - p1.x, p2.y - p1.y) +
    Math.hypot(p3.x - p2.x, p3.y - p2.y);
  const n = Math.max(6, Math.round(approx / spacing));
  const out = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push({
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
    });
  }
  return out;
}

function sampleLine(a, b, spacing = 1.2) {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const n = Math.max(1, Math.round(len / spacing));
  const out = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  return out;
}

function lastTangent(pts) {
  if (!pts || pts.length < 2) return { x: 1, y: 0 };
  const a = pts[pts.length - 2];
  const b = pts[pts.length - 1];
  return norm({ x: b.x - a.x, y: b.y - a.y });
}

function concat(dst, extra) {
  for (let i = 0; i < extra.length; i++) {
    const p = extra[i];
    const last = dst[dst.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 0.3) dst.push({ x: p.x, y: p.y });
  }
  return dst;
}


/** Safe skeleton: x-monotone wave, a tight corner near the end, then a tail that leaves the wave. */
function wavePoints(x0, x1, y0, amp, periods, phase, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = x0 + (x1 - x0) * t;
    const env = Math.sin(Math.PI * t);
    const y = y0 + amp * env * Math.sin(2 * Math.PI * periods * t + phase);
    pts.push({ x, y });
  }
  return pts;
}

function scallopPoints(x0, x1, y0, amp, bumps, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = x0 + (x1 - x0) * t;
    const s = Math.abs(Math.sin(Math.PI * bumps * t));
    pts.push({ x, y: y0 - amp * s });
  }
  return pts;
}

function appendTail(pts, cornerR, cornerDeg, tailLen) {
  const start = pts[pts.length - 1];
  const t = lastTangent(pts);
  const arc = sampleArc(start, t, cornerR, cornerDeg);
  concat(pts, arc.points);
  const end = pts[pts.length - 1];
  const t2 = lastTangent(pts);
  // Go forward, then a gentle curve further away from the incoming wave (same side as the turn).
  const side = { x: -t2.y * Math.sign(cornerDeg || 1), y: t2.x * Math.sign(cornerDeg || 1) };
  const p1 = add(end, t2, tailLen * 0.45);
  const p2 = add(p1, side, Math.min(36, tailLen * 0.2));
  const p3 = add(p2, t2, tailLen * 0.45);
  concat(pts, sampleCubic(end, p1, p2, p3));
  return pts;
}

function lengthOfWave(x0, x1, y0, amp, periods, phase, n) {
  return pathLength(wavePoints(x0, x1, y0, amp, periods, phase, n));
}

function solveWaveAmp(x0, x1, y0, periods, phase, want, n) {
  let lo = 0;
  let hi = 1;
  while (lengthOfWave(x0, x1, y0, hi, periods, phase, n) < want && hi < 70) hi *= 1.6;
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    if (lengthOfWave(x0, x1, y0, mid, periods, phase, n) < want) lo = mid;
    else hi = mid;
  }
  return hi;
}


function segmentsIntersect(a, b, c, d) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const cdx = d.x - c.x;
  const cdy = d.y - c.y;
  const den = abx * cdy - aby * cdx;
  if (Math.abs(den) < 1e-12) return false;
  const t = ((c.x - a.x) * cdy - (c.y - a.y) * cdx) / den;
  const u = ((c.x - a.x) * aby - (c.y - a.y) * abx) / den;
  const eps = 1e-6;
  return t > eps && t < 1 - eps && u > eps && u < 1 - eps;
}

export function selfIntersects(pts) {
  const n = (pts || []).length;
  if (n < 4) return false;
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 2; j < n - 1; j++) {
      if (i === 0 && j === n - 2) continue;
      if (segmentsIntersect(pts[i], pts[i + 1], pts[j], pts[j + 1])) return true;
    }
  }
  return false;
}

function denseToSpacing(pts, spacing = PATH_SPACING) {
  const total = pathLength(pts);
  if (total < spacing) return (pts || []).map((p) => ({ x: p.x, y: p.y }));
  const n = Math.max(2, Math.round(total / spacing) + 1);
  return resamplePath(pts, n);
}

function translate(pts, dx, dy) {
  return (pts || []).map((p) => ({ x: p.x + dx, y: p.y + dy }));
}

function scaleAbout(pts, origin, k) {
  return (pts || []).map((p) => ({
    x: origin.x + (p.x - origin.x) * k,
    y: origin.y + (p.y - origin.y) * k,
  }));
}

function bbox(pts) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of pts || []) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

function fitOnBoard(pts) {
  if (!pts.length) return pts;
  let out = pts.map((p) => ({ x: p.x, y: p.y }));
  out = translate(out, -out[0].x, 0);
  let y0 = out[0].y;
  if (y0 < BOARD_MARGIN) out = translate(out, 0, BOARD_MARGIN - y0);
  if (y0 > BOARD_H - BOARD_MARGIN) out = translate(out, 0, BOARD_H - BOARD_MARGIN - y0);
  const box = bbox(out);
  if (box.minX < 0) out = translate(out, -box.minX, 0);
  if (out[0].x > 0.5) out = translate(out, -out[0].x, 0);
  const box2 = bbox(out);
  const maxW = BOARD_W - 2;
  const maxH = BOARD_H - 4;
  const w = box2.maxX - box2.minX;
  const h = box2.maxY - box2.minY;
  let k = 1;
  if (w > maxW) k = Math.min(k, maxW / Math.max(w, 1));
  if (h > maxH) k = Math.min(k, maxH / Math.max(h, 1));
  if (k < 0.999) {
    out = scaleAbout(out, out[0], k);
    out = translate(out, -out[0].x, 0);
    const y = clamp(out[0].y, BOARD_MARGIN, BOARD_H - BOARD_MARGIN);
    out = translate(out, 0, y - out[0].y);
  }
  const box3 = bbox(out);
  if (box3.minY < 2) out = translate(out, 0, 2 - box3.minY);
  if (box3.maxY > BOARD_H - 2) out = translate(out, 0, BOARD_H - 2 - bbox(out).maxY);
  const box4 = bbox(out);
  if (box4.maxX > BOARD_W - 1) {
    const k2 = (BOARD_W - 1 - out[0].x) / Math.max(1e-6, box4.maxX - out[0].x);
    if (k2 > 0 && k2 < 1) out = scaleAbout(out, out[0], k2);
  }
  out[0] = { x: 0, y: clamp(out[0].y, 4, BOARD_H - 4) };
  return out;
}

function buildSafe(family, jitter, cornerR, cornerDeg, targetLen) {
  const j = (i, scale = 1) => (jitter[i] || 0) * scale;
  const y0 = clamp(105 + j(0, 24), 54, 156);
  const rC = clamp(cornerR, CORNER_R_MIN, CORNER_R_MAX);
  const aC = clamp(Math.abs(cornerDeg), CORNER_DEG_MIN, CORNER_DEG_MAX) * Math.sign(cornerDeg || 1);
  const arcLen = Math.abs(rC * ((aC * Math.PI) / 180));
  const x1 = 188 + j(1, 16);
  let periods = 2.05;
  let phase = j(2, Math.PI);
  let tailWant = 90;
  let useScallop = false;
  let bumps = 3;
  let shaftAmp = null;

  if (family === "wave") {
    periods = 2.2 + j(3, 0.25);
    tailWant = 72 + j(4, 10);
  } else if (family === "leaf") {
    periods = 1.05 + j(3, 0.1);
    phase = 0.15 * Math.PI;
    tailWant = 100 + j(4, 12);
  } else if (family === "cloud") {
    useScallop = true;
    bumps = 3;
    tailWant = 70 + j(4, 8);
  } else if (family === "key") {
    periods = 0.55;
    shaftAmp = 6 + Math.abs(j(3, 3));
    tailWant = 110 + j(4, 10);
  } else if (family === "recess") {
    periods = 0.8 + j(3, 0.1);
    shaftAmp = 10 + Math.abs(j(4, 4));
    tailWant = 120 + j(5, 10);
  } else if (family === "swirl") {
    periods = 1.6 + j(3, 0.2);
    tailWant = 130 + j(4, 12);
  } else if (family === "bird") {
    periods = 1.35 + j(3, 0.15);
    tailWant = 95 + j(4, 10);
  }

  tailWant = clamp(tailWant, 64, 150);
  const waveWant = Math.max(160, targetLen - arcLen - tailWant);
  const n = 90;
  let amp;
  let body;
  if (useScallop) {
    let lo = 8;
    let hi = 20;
    const lenS = (A) => pathLength(scallopPoints(0, x1, y0, A, bumps, n));
    while (lenS(hi) < waveWant && hi < 64) hi *= 1.4;
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) / 2;
      if (lenS(mid) < waveWant) lo = mid;
      else hi = mid;
    }
    amp = hi;
    body = scallopPoints(0, x1, y0, amp, bumps, n);
  } else {
    amp = shaftAmp != null ? shaftAmp : solveWaveAmp(0, x1, y0, periods, phase, waveWant, n);
    // Keep the wave inside the board's y range with a little margin.
    const yRoom = Math.min(y0 - 16, BOARD_H - 16 - y0);
    amp = Math.min(amp, Math.max(6, yRoom - 4));
    body = wavePoints(0, x1, y0, amp, periods, phase, n);
  }
  const pts = body.map((p) => ({ x: p.x, y: p.y }));
  appendTail(pts, rC, aC, tailWant);
  return pts;
}

function buildPath(family, { jitter, cornerR, cornerDeg, targetLen }) {
  const target = clamp(targetLen, PATH_LEN_MIN, PATH_LEN_MAX);
  let raw = buildSafe(family, jitter, cornerR, cornerDeg, target);
  let pts = denseToSpacing(raw);
  pts = fitOnBoard(pts);
  // If board fit shortened the path, stretch the tail a little by a second pass with a longer target.
  if (pathLength(pts) < PATH_LEN_MIN) {
    raw = buildSafe(family, jitter, cornerR, cornerDeg, target + (PATH_LEN_MIN - pathLength(pts) + 20));
    pts = fitOnBoard(denseToSpacing(raw));
  }
  pts = denseToSpacing(pts);
  if (selfIntersects(pts) || pathLength(pts) < PATH_LEN_MIN - 4 || pathLength(pts) > PATH_LEN_MAX + 20) {
    const mild = jitter.slice();
    // Flatten ornaments and use a milder turn so the tail cannot fold back onto the wave.
    const deg = Math.sign(cornerDeg || 1) * Math.min(100, Math.max(75, Math.abs(cornerDeg)));
    raw = buildSafe("wave", mild, Math.min(22, Math.max(12, cornerR)), deg, clamp(target, 320, 400));
    pts = fitOnBoard(denseToSpacing(raw));
    pts = denseToSpacing(pts);
  }
  pts = pts.map((p, i) => ({
    x: i === 0 ? 0 : clamp(p.x, 0, BOARD_W),
    y: clamp(p.y, 2, BOARD_H - 2),
  }));
  pts = denseToSpacing(pts);
  pts[0] = { x: 0, y: pts[0].y };
  const L = pathLength(pts);
  if (L < PATH_LEN_MIN && L > 0) {
    const k = PATH_LEN_MIN / L;
    const grown = scaleAbout(pts, pts[0], k);
    const box = bbox(grown);
    if (box.maxX <= BOARD_W && box.minY >= 0 && box.maxY <= BOARD_H) pts = denseToSpacing(grown);
  }
  pts[0] = { x: 0, y: pts[0].y };
  return pts;
}

export function dailyParams(rngState) {
  let a = rngState >>> 0;
  const woodPick = pickRow(a, WOOD_TABLE);
  a = woodPick.a;
  const wood = woodPick.row;

  const fam = pickFamily(a);
  a = fam.a;
  const family = fam.family;

  const jitter = [];
  for (let i = 0; i < JITTER_COUNT; i++) {
    const r = rngRange(a, -1, 1);
    a = r.a;
    jitter.push(r.value);
  }

  let r = rngRange(a, 0.28, 0.72);
  a = r.a;
  const cornerAt = r.value;
  r = rngRange(a, CORNER_R_MIN, CORNER_R_MAX);
  a = r.a;
  const cornerR = r.value;
  const signStep = rngStep(a);
  a = signStep.a;
  const cornerSign = signStep.value < 0.5 ? -1 : 1;
  r = rngRange(a, CORNER_DEG_MIN, CORNER_DEG_MAX);
  a = r.a;
  const cornerDeg = r.value * cornerSign;
  r = rngRange(a, PATH_LEN_MIN, PATH_LEN_MAX);
  a = r.a;
  const targetLen = r.value;

  // cornerAt is consumed in the stream and used as a phase nudge on families that care.
  jitter[5] = jitter[5] * 0.7 + (cornerAt - 0.5) * 0.6;

  const path = buildPath(family, { jitter, cornerR, cornerDeg, targetLen, cornerAt });
  return {
    params: {
      wood: wood.wood,
      sawK: wood.sawK,
      bendK: wood.bendK,
      tearK: wood.tearK,
      path,
      pathLen: pathLength(path),
      family,
    },
    rngState: a,
  };
}

export { selfIntersects as pathSelfIntersects };
