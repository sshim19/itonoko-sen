/**
 * Web Audio だけで鳴らす効果音。ファイルもライブラリも使わない。
 * エンジンは触らず、state の変化から鳴らす音を決める。工房らしい、落ち着いた音にする。
 */

import * as constants from "../engine/constants.mjs";

export const MUTE_KEY = constants.STORAGE_MUTED ?? "itonoko-sen:muted";
const MASTER_GAIN = 0.36;

function readMuted(storage) {
  if (!storage) return false;
  try {
    const v = storage.getItem(MUTE_KEY);
    return v === "1" || v === "true";
  } catch {
    return false;
  }
}

function writeMuted(muted, storage) {
  if (!storage) return;
  try {
    storage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    /* ignore quota / private mode */
  }
}

export function loadMuted(storage = globalThis.localStorage) {
  return readMuted(storage);
}

function snapshot(state) {
  const kerf = state?.kerf;
  return {
    status: state?.status || "title",
    phase: state?.phase || "set",
    bend: Number(state?.bend) || 0,
    tearCount: Number(state?.tearCount) || 0,
    snapped: !!state?.snapped,
    sawRate: Number(state?.right?.sawRate) || 0,
    feed: Number(state?.left?.feed) || 0,
    kerfLen: Array.isArray(kerf) ? kerf.length : 0,
    grade: state?.grade ?? null,
    score: Math.max(0, Math.floor(Number(state?.score) || 0)),
  };
}

/**
 * 直前の snapshot と新しい state から、鳴らすべき単発の音を決める。純関数。
 * @returns {{ type: "place"|"creak"|"tear"|"snap"|"reveal", grade?: string, amount?: number } | null}
 */
export function soundEvent(prev, state) {
  if (!state) return null;
  const now = snapshot(state);
  const before = prev || { status: "idle", phase: "none", bend: 0, tearCount: 0, snapped: false };
  if (
    now.status === "playing" &&
    now.phase === "set" &&
    (before.status !== "playing" || before.phase !== "set")
  ) {
    return { type: "place" };
  }
  if (before.phase !== "reveal" && now.phase === "reveal") {
    return { type: "reveal", grade: now.grade || "early", score: now.score };
  }
  if (before.status !== "over" && now.status === "over" && before.phase !== "reveal") {
    return { type: "reveal", grade: now.grade || "early", score: now.score };
  }
  if (!before.snapped && now.snapped) {
    return { type: "snap" };
  }
  if (now.tearCount > (Number(before.tearCount) || 0)) {
    return { type: "tear", amount: now.tearCount - (Number(before.tearCount) || 0) };
  }
  if (
    now.status === "playing" &&
    now.phase === "cut" &&
    now.bend > (Number(before.bend) || 0) + 0.05
  ) {
    return { type: "creak", amount: now.bend - (Number(before.bend) || 0) };
  }
  return null;
}

export function createSfx() {
  return {
    prev: null,
    muted: loadMuted(),
    ctx: null,
    master: null,
    compressor: null,
    noiseBuf: null,
    humOsc: null,
    humOsc2: null,
    humGain: null,
    scrapeSrc: null,
    scrapeFilter: null,
    scrapeGain: null,
    lastCreakAt: 0,
  };
}

export function resetSfx(sfx) {
  if (!sfx) return;
  sfx.prev = null;
  sfx.lastCreakAt = 0;
  stopLoops(sfx, true);
}

function applyMuteGain(sfx, now) {
  if (!sfx?.master || !sfx.ctx) return;
  const g = sfx.master.gain;
  const t = now ?? sfx.ctx.currentTime;
  g.cancelScheduledValues(t);
  g.setValueAtTime(g.value, t);
  g.linearRampToValueAtTime(sfx.muted ? 0 : MASTER_GAIN, t + 0.03);
}

export function setMuted(sfx, muted, storage = globalThis.localStorage) {
  if (!sfx) return;
  sfx.muted = !!muted;
  writeMuted(sfx.muted, storage);
  applyMuteGain(sfx);
}

export function isMuted(sfx) {
  return !!sfx?.muted;
}

/** 最初の操作で AudioContext を作り、iOS 向けに resume する。 */
export function unlockSfx(sfx) {
  if (!sfx) return;
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) return;
  try {
    if (!sfx.ctx) {
      const ctx = new AC();
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -16;
      compressor.knee.value = 12;
      compressor.ratio.value = 2.8;
      compressor.attack.value = 0.004;
      compressor.release.value = 0.18;
      const master = ctx.createGain();
      master.gain.value = sfx.muted ? 0 : MASTER_GAIN;
      master.connect(compressor);
      compressor.connect(ctx.destination);
      sfx.ctx = ctx;
      sfx.master = master;
      sfx.compressor = compressor;
    }
    if (sfx.ctx.state === "suspended") {
      const p = sfx.ctx.resume();
      if (p && typeof p.catch === "function") p.catch(() => {});
    }
  } catch {
    /* AudioContext unavailable */
  }
}

function noiseBuffer(sfx) {
  if (sfx.noiseBuf) return sfx.noiseBuf;
  const ctx = sfx.ctx;
  const len = Math.floor(ctx.sampleRate * 1.2);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    last = last * 0.88 + white * 0.12;
    data[i] = last * 2.0;
  }
  sfx.noiseBuf = buf;
  return buf;
}

function playTone(ctx, dest, { freq, type = "sine", t0, dur, peak, attack = 0.012, endFreq }) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (endFreq && endFreq !== freq) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t0 + dur);
  }
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(dest);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
  osc.onended = () => {
    try {
      osc.disconnect();
      g.disconnect();
    } catch {
      /* already gone */
    }
  };
}

function playNoise(sfx, dest, { t0, dur, peak, attack = 0.008, freq = 1200, type = "lowpass", q = 0.7, endFreq }) {
  const ctx = sfx.ctx;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(sfx);
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(freq, t0);
  if (endFreq) filter.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), t0 + dur);
  filter.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter);
  filter.connect(g);
  g.connect(dest);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
  src.onended = () => {
    try {
      src.disconnect();
      filter.disconnect();
      g.disconnect();
    } catch {
      /* already gone */
    }
  };
}

/** 板が台に着く、短い木の音。 */
function playPlace(sfx) {
  const ctx = sfx.ctx;
  const dest = sfx.master;
  const t0 = ctx.currentTime + 0.01;
  playNoise(sfx, dest, {
    t0,
    dur: 0.2,
    peak: 0.1,
    attack: 0.01,
    freq: 420,
    type: "lowpass",
    q: 0.7,
    endFreq: 140,
  });
  playTone(ctx, dest, {
    freq: 148,
    endFreq: 86,
    type: "triangle",
    t0,
    dur: 0.26,
    peak: 0.07,
    attack: 0.01,
  });
}

/** しなりが増えるとき。張りのある、低いきしみ。 */
function playCreak(sfx, ev) {
  const now = sfx.ctx.currentTime;
  if (now - (sfx.lastCreakAt || 0) < 0.28) return;
  sfx.lastCreakAt = now;
  const amount = Math.max(0.05, Math.min(0.5, Number(ev?.amount) || 0.08));
  const peak = 0.03 + Math.min(0.05, amount * 0.12);
  playTone(sfx.ctx, sfx.master, {
    freq: 196,
    endFreq: 150,
    type: "sawtooth",
    t0: now + 0.002,
    dur: 0.2,
    peak: peak * 0.35,
    attack: 0.016,
  });
  playTone(sfx.ctx, sfx.master, {
    freq: 98,
    endFreq: 78,
    type: "sine",
    t0: now + 0.004,
    dur: 0.24,
    peak,
    attack: 0.02,
  });
}

/** 短い、粗い裂け。 */
function playTear(sfx) {
  const ctx = sfx.ctx;
  const dest = sfx.master;
  const t0 = ctx.currentTime + 0.002;
  playNoise(sfx, dest, {
    t0,
    dur: 0.16,
    peak: 0.12,
    attack: 0.006,
    freq: 1400,
    type: "bandpass",
    q: 0.8,
    endFreq: 280,
  });
  playTone(ctx, dest, {
    freq: 210,
    endFreq: 90,
    type: "square",
    t0,
    dur: 0.12,
    peak: 0.03,
    attack: 0.008,
  });
}

/** 刃の、乾いた一音。 */
function playSnap(sfx) {
  const ctx = sfx.ctx;
  const dest = sfx.master;
  const t0 = ctx.currentTime + 0.002;
  playTone(ctx, dest, {
    freq: 620,
    endFreq: 180,
    type: "triangle",
    t0,
    dur: 0.18,
    peak: 0.12,
    attack: 0.004,
  });
  playNoise(sfx, dest, {
    t0,
    dur: 0.14,
    peak: 0.1,
    attack: 0.004,
    freq: 2400,
    type: "highpass",
    q: 0.6,
    endFreq: 400,
  });
  playTone(ctx, dest, {
    freq: 140,
    endFreq: 70,
    type: "sine",
    t0: t0 + 0.02,
    dur: 0.22,
    peak: 0.06,
    attack: 0.008,
  });
}

/** 刃が止まって板を置く音のあと、等級に応じた穏やかな余韻。 */
function playReveal(sfx, ev) {
  const ctx = sfx.ctx;
  const dest = sfx.master;
  const t0 = ctx.currentTime + 0.004;
  playTone(ctx, dest, {
    freq: 160,
    endFreq: 88,
    type: "sine",
    t0,
    dur: 0.28,
    peak: 0.09,
    attack: 0.01,
  });
  playNoise(sfx, dest, {
    t0,
    dur: 0.14,
    peak: 0.055,
    attack: 0.006,
    freq: 520,
    type: "lowpass",
    q: 0.6,
    endFreq: 160,
  });

  const grade = ev?.grade || "early";
  if (grade === "exact" || grade === "good") {
    const root = grade === "exact" ? 698 : 523;
    playTone(ctx, dest, {
      freq: root,
      type: "sine",
      t0: t0 + 0.12,
      dur: 0.46,
      peak: 0.09,
      attack: 0.02,
    });
    playTone(ctx, dest, {
      freq: root * 1.5,
      type: "sine",
      t0: t0 + 0.18,
      dur: 0.54,
      peak: 0.05,
      attack: 0.03,
    });
    if (grade === "exact") {
      playTone(ctx, dest, {
        freq: root * 2,
        type: "sine",
        t0: t0 + 0.24,
        dur: 0.5,
        peak: 0.035,
        attack: 0.04,
      });
    }
  } else if (grade === "close") {
    playTone(ctx, dest, {
      freq: 294,
      type: "sine",
      t0: t0 + 0.1,
      dur: 0.3,
      peak: 0.06,
      attack: 0.02,
    });
  } else {
    playNoise(sfx, dest, {
      t0: t0 + 0.08,
      dur: 0.1,
      peak: 0.04,
      attack: 0.01,
      freq: 380,
      type: "bandpass",
      q: 0.7,
      endFreq: 150,
    });
    playTone(ctx, dest, {
      freq: 150,
      endFreq: 90,
      type: "sine",
      t0: t0 + 0.08,
      dur: 0.12,
      peak: 0.035,
      attack: 0.012,
    });
  }
}

function ensureLoops(sfx) {
  if (!sfx.ctx || !sfx.master) return;
  if (sfx.humOsc) return;
  const ctx = sfx.ctx;

  const hum = ctx.createOscillator();
  hum.type = "triangle";
  hum.frequency.value = 90;
  const hum2 = ctx.createOscillator();
  hum2.type = "sawtooth";
  hum2.frequency.value = 180;
  const humGain = ctx.createGain();
  humGain.gain.value = 0;
  const humFilter = ctx.createBiquadFilter();
  humFilter.type = "lowpass";
  humFilter.frequency.value = 700;
  hum.connect(humFilter);
  hum2.connect(humFilter);
  humFilter.connect(humGain);
  humGain.connect(sfx.master);
  hum.start();
  hum2.start();
  sfx.humOsc = hum;
  sfx.humOsc2 = hum2;
  sfx.humGain = humGain;
  sfx.humFilter = humFilter;

  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(sfx);
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 1800;
  filter.Q.value = 1.1;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  src.connect(filter);
  filter.connect(gain);
  gain.connect(sfx.master);
  src.start();
  sfx.scrapeSrc = src;
  sfx.scrapeFilter = filter;
  sfx.scrapeGain = gain;
}

function stopLoops(sfx, hard = false) {
  if (!sfx) return;
  const t = sfx.ctx?.currentTime ?? 0;
  if (sfx.humGain) {
    try {
      sfx.humGain.gain.cancelScheduledValues(t);
      sfx.humGain.gain.setTargetAtTime(0, t, 0.06);
    } catch {
      /* ignore */
    }
  }
  if (sfx.scrapeGain) {
    try {
      sfx.scrapeGain.gain.cancelScheduledValues(t);
      sfx.scrapeGain.gain.setTargetAtTime(0, t, 0.05);
    } catch {
      /* ignore */
    }
  }
  if (!hard) return;
  try {
    sfx.humOsc?.stop();
    sfx.humOsc2?.stop();
    sfx.humOsc?.disconnect();
    sfx.humOsc2?.disconnect();
    sfx.humFilter?.disconnect();
    sfx.humGain?.disconnect();
  } catch {
    /* already gone */
  }
  try {
    sfx.scrapeSrc?.stop();
    sfx.scrapeSrc?.disconnect();
    sfx.scrapeFilter?.disconnect();
    sfx.scrapeGain?.disconnect();
  } catch {
    /* already gone */
  }
  sfx.humOsc = null;
  sfx.humOsc2 = null;
  sfx.humGain = null;
  sfx.humFilter = null;
  sfx.scrapeSrc = null;
  sfx.scrapeFilter = null;
  sfx.scrapeGain = null;
}

function syncLoops(sfx, state) {
  if (!sfx.ctx || sfx.muted) {
    if (sfx.humGain) stopLoops(sfx, false);
    return;
  }
  const playing = state?.status === "playing" && state?.phase === "cut" && !state?.snapped;
  const sawRate = Math.max(0, Number(state?.right?.sawRate) || 0);
  const feed = Math.abs(Number(state?.left?.feed) || 0);
  const prevLen = Number(sfx.prev?.kerfLen) || 0;
  const kerfLen = Array.isArray(state?.kerf) ? state.kerf.length : 0;
  const advancing = playing && (kerfLen > prevLen || (sawRate > 0.8 && feed > 0.8));
  if (!playing || sawRate < 0.35) {
    if (sfx.humGain) {
      const t = sfx.ctx.currentTime;
      sfx.humGain.gain.setTargetAtTime(0, t, 0.1);
      if (sfx.scrapeGain) sfx.scrapeGain.gain.setTargetAtTime(0, t, 0.08);
    }
    return;
  }
  ensureLoops(sfx);
  const t = sfx.ctx.currentTime;
  const hum = Math.min(0.055, 0.01 + sawRate * 0.0032);
  sfx.humGain.gain.setTargetAtTime(hum, t, 0.1);
  const f = 70 + Math.min(90, sawRate * 6);
  sfx.humOsc.frequency.setTargetAtTime(f, t, 0.12);
  sfx.humOsc2.frequency.setTargetAtTime(f * 2.05, t, 0.14);
  const scrape = advancing ? 0.016 + Math.min(0.04, sawRate * 0.0024) : 0;
  sfx.scrapeGain.gain.setTargetAtTime(scrape, t, 0.08);
  sfx.scrapeFilter.frequency.setTargetAtTime(1200 + Math.min(1400, sawRate * 70), t, 0.12);
}

/**
 * state の差分を見て効果音を鳴らす。切断中の切削はループで追従する。
 * @param {object} sfx
 * @param {object} state
 */
export function syncSound(sfx, state) {
  if (!sfx) return null;
  const ev = soundEvent(sfx.prev, state);
  if (sfx.ctx && !sfx.muted) {
    try {
      syncLoops(sfx, state);
      if (ev?.type === "place") playPlace(sfx);
      else if (ev?.type === "creak") playCreak(sfx, ev);
      else if (ev?.type === "tear") playTear(sfx);
      else if (ev?.type === "snap") {
        stopLoops(sfx, false);
        playSnap(sfx);
      } else if (ev?.type === "reveal") {
        stopLoops(sfx, false);
        playReveal(sfx, ev);
      }
    } catch {
      /* audio graph failed; ignore */
    }
  } else if (ev?.type === "reveal" || ev?.type === "snap") {
    stopLoops(sfx, false);
  }
  sfx.prev = snapshot(state);
  return ev;
}
