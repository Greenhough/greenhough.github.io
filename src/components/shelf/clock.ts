import * as THREE from 'three';

/**
 * The room's clock, and the one switch that stops it.
 *
 * Everything in the room that moves without being asked reads its time from
 * here: the lamps coming on, the dust, the leaves, the record, the camera's
 * idle drift. `?t=<seconds>` freezes that time, so a still of an exact moment
 * can be taken and taken again: `/?t=0.4` is mid-flicker, `/writing?t=30` is
 * the Desk long after everything has settled. Frozen, the eased things (the
 * camera, a Box sliding out) also jump straight to where they are going,
 * because a still has no time for them to get there in.
 *
 * This is how the room is judged: from stills of the page, in a browser, not
 * from a render of the model. See docs/adr/0006.
 */
const frozenAt = (() => {
  if (typeof window === 'undefined') return null;
  const raw = new URLSearchParams(window.location.search).get('t');
  if (raw === null || raw === '') return null;
  const seconds = Number(raw);
  return Number.isFinite(seconds) ? seconds : null;
})();

const startedAt = typeof performance === 'undefined' ? 0 : performance.now();

export const isFrozen = frozenAt !== null;

/** Seconds since the room loaded, or the frozen time. */
export function roomTime(): number {
  return frozenAt ?? (performance.now() - startedAt) / 1000;
}

/** An easing factor for a frame, or 1 when frozen so things arrive at once. */
export function easeFor(delta: number, stiffness: number): number {
  return isFrozen ? 1 : 1 - Math.pow(stiffness, delta);
}

/**
 * How far on the lamps are, 0 to 1, `t` seconds after the room first drew.
 *
 * They strike like a tube: a flash, nothing, a longer flash, a dip, then a
 * warm-up. It is over inside two seconds and it is the first thing the page
 * does, so the room is doing something before anyone has touched it.
 */
export function lampLevel(t: number): number {
  if (t < 0.3) return 0;
  if (t < 0.36) return 0.5;
  if (t < 0.5) return 0.04;
  if (t < 0.58) return 0.78;
  if (t < 0.68) return 0.22;
  const rise = Math.min(1, (t - 0.68) / 1.1);
  return 0.55 + 0.45 * (1 - Math.pow(1 - rise, 3));
}

let litAt: number | null = null;

/**
 * How far on the lamps are right now. They strike once, when the room first
 * draws, which is the first time anything asks. Frozen time is taken as time
 * since then, so `?t=0.4` is a still of the flicker itself.
 */
export function lampsNow(): number {
  const t = roomTime();
  if (litAt === null) litAt = isFrozen ? 0 : t;
  return lampLevel(t - litAt);
}

/** The room with the lamps off: what the dusk alone leaves, cool and dim. */
const LAMPS_OFF = new THREE.Color(0.13, 0.17, 0.27);
const LAMPS_ON = new THREE.Color(1, 1, 1);

/**
 * What every baked surface is multiplied by this frame. One shared colour, so
 * the room, the carcass and the Books at rest all come up together.
 */
export const roomLight = new THREE.Color(1, 1, 1);

export function setLamps(level: number): void {
  roomLight.copy(LAMPS_OFF).lerp(LAMPS_ON, level);
}
