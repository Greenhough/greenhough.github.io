/**
 * The sound of the Room.
 *
 * Off until it is asked for, by the switch in the nav, and remembered after
 * that. A page that makes a noise nobody asked for is a page that gets closed.
 *
 * None of it is a recording. Everything here is made in the browser from
 * noise, a few filters and a sine or two: a tick is three milliseconds of it
 * rung through a narrow band. So it costs no download, there is nothing to
 * license, and a cue can be a little different every time, which is most of
 * what stops a short sound played often from grating.
 *
 * Only cues: one-offs, asked for by name with hear(), each one the Room
 * answering something the visitor did. There is no bed under them. A room
 * tone, wind off the Prairie, rain on the glass and a record's crackle were
 * all tried, and on a laptop speaker every one of them was heard as hiss.
 *
 * The Bust's voice is not here. It is a recording, it answers a click, and it
 * plays whether or not this is on: see voice.ts.
 */

export type Cue =
  | 'switch'
  | 'tick'
  | 'slide'
  | 'take'
  | 'back'
  | 'paper'
  | 'flip'
  | 'needle'
  | 'die'
  | 'place';

type Place = 'shelf' | 'desk' | 'console' | 'laptop';

const KEY = 'room-sound';
/** Everything, turned down a touch. */
const MASTER = 0.9;

let on = false;
try {
  on = typeof localStorage !== 'undefined' && localStorage.getItem(KEY) === 'on';
} catch {
  // A private window, or storage turned off: the sound is simply off.
}

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;

let place: Place = 'shelf';
let record = false;
const listeners = new Set<() => void>();

/** How much of the clock each View hears. It hangs over the Desk. */
const AT_CLOCK: Record<Place, number> = { shelf: 0.5, console: 0.25, desk: 1, laptop: 0.9 };

export function soundOn(): boolean {
  return on;
}

/** For React: call back whenever the sound is switched. */
export function onSound(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Make the audio graph. Only ever from inside a click or a key press, which
 * is what browsers ask for before they will make a sound.
 */
function wake(): boolean {
  if (ctx) {
    void ctx.resume();
    return true;
  }
  try {
    const Context =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return false;
    ctx = new Context();
  } catch {
    return false;
  }
  const c = ctx;
  master = c.createGain();
  master.gain.value = 0;
  master.connect(c.destination);

  // Two seconds of white noise, shared by every cue. Played from a random
  // place each time, so no two cues are the same two seconds.
  noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return true;
}

/** Fade everything in or out with the switch. */
function settle(): void {
  if (!ctx || !master) return;
  const t = ctx.currentTime;
  master.gain.cancelScheduledValues(t);
  master.gain.setValueAtTime(master.gain.value, t);
  master.gain.linearRampToValueAtTime(on ? MASTER : 0, t + (on ? 0.6 : 0.25));
}

/**
 * The atom every cue is built from: a burst of noise through a band, with a
 * sharp start and a fall. `to` slides the band while it sounds.
 */
function strike(at: number, length: number, band: number, q: number, level: number, to?: number, attack = 0.002): void {
  if (!ctx || !master || !noise) return;
  const source = ctx.createBufferSource();
  source.buffer = noise;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(band, at);
  if (to) filter.frequency.exponentialRampToValueAtTime(to, at + length);
  filter.Q.value = q;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(level, at + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  source.connect(filter).connect(gain).connect(master);
  source.start(at, Math.random() * 1.5);
  source.stop(at + length + 0.05);
}

/** A low knock: something with weight meeting wood. */
function thud(at: number, pitch: number, length: number, level: number): void {
  if (!ctx || !master) return;
  const osc = ctx.createOscillator();
  osc.frequency.setValueAtTime(pitch * 1.6, at);
  osc.frequency.exponentialRampToValueAtTime(pitch, at + length * 0.4);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(level, at);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  osc.connect(gain).connect(master);
  osc.start(at);
  osc.stop(at + length + 0.05);
}

/** A little either side, so the same cue is never quite the same sound. */
const about = (value: number, by = 0.12) => value * (1 + (Math.random() * 2 - 1) * by);

let tock = false;
/** When a Box last slid out, so a pointer run along the Shelf is a few slides and not a zip. */
let slidAt = -Infinity;

/** Play a cue, if the sound is on. `amount` scales it, 0 to 1. */
export function hear(cue: Cue, amount = 1): void {
  if (!on || !ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime + 0.005;
  switch (cue) {
    case 'switch':
      // A rocker: the click of it going over, and the smaller one of it landing.
      strike(t, 0.012, about(2300), 3, 0.2 * amount);
      thud(t, about(170), 0.03, 0.09 * amount);
      strike(t + 0.034, 0.008, about(3100), 4, 0.09 * amount);
      break;
    case 'tick':
      // Tick and tock are a few hundred hertz apart, as an escapement's are.
      tock = !tock;
      strike(t, 0.004, tock ? 2700 : 3300, 7, 0.05 * amount * AT_CLOCK[place]);
      break;
    case 'slide':
      // Cloth on oak, a hand's width of it.
      if (t - slidAt < 0.22) break;
      slidAt = t;
      strike(t, 0.2, about(520), 0.9, 0.035 * amount, about(900), 0.05);
      break;
    case 'take':
      // The whole depth of the Shelf, and the Book coming free at the end.
      strike(t, 0.42, about(460), 0.9, 0.06 * amount, about(1100), 0.1);
      strike(t + 0.4, 0.02, about(1400), 2, 0.03 * amount);
      break;
    case 'back':
      strike(t, 0.34, about(900), 0.9, 0.05 * amount, about(480), 0.06);
      thud(t + 0.33, about(105), 0.09, 0.14 * amount);
      strike(t + 0.33, 0.012, about(900), 2, 0.05 * amount);
      break;
    case 'paper':
      // A sheet picked up: several small crackles, none of them even.
      for (let i = 0; i < 7; i++) {
        strike(t + i * about(0.05, 0.5), about(0.05, 0.4), about(4200, 0.3), 0.8, about(0.035, 0.5) * amount, undefined, 0.006);
      }
      break;
    case 'flip':
      // Card on card, and the sleeve landing against the next.
      strike(t, 0.07, about(2600), 1.2, 0.07 * amount, about(1500), 0.004);
      thud(t + 0.06, about(210), 0.04, 0.05 * amount);
      break;
    case 'needle':
      // The stylus finding the groove.
      thud(t, about(72), 0.14, 0.2 * amount);
      strike(t + 0.01, 0.3, about(1500), 0.7, 0.07 * amount, about(2600), 0.01);
      break;
    case 'die': {
      // A die tumbling on a desk: three or four knocks, closer and quieter.
      let when = t;
      const knocks = 3 + Math.floor(Math.random() * 2);
      for (let i = 0; i < knocks; i++) {
        strike(when, 0.03, about(1100, 0.25), 9, (0.16 * amount) / (1 + i * 0.7));
        when += about(0.085, 0.3) / (1 + i * 0.25);
      }
      break;
    }
    case 'place':
      strike(t, 0.035, about(950, 0.2), 8, 0.16 * amount);
      thud(t, about(150), 0.05, 0.06 * amount);
      break;
  }
}

/**
 * Switch the sound. Call it from a click: it is the gesture the browser needs
 * to let the first sound out.
 */
export function setSound(next: boolean): void {
  if (next && !wake()) return;
  on = next;
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    // Not remembered, then.
  }
  settle();
  listeners.forEach((listener) => listener());
}

/** Where the camera is standing. The clock is loud at the Desk and faint at the Console. */
export function soundPlace(next: Place): void {
  place = next;
}

/** A record is on the player, or has come off it: the stylus going down. */
export function soundRecord(playing: boolean): void {
  if (playing && !record) hear('needle');
  record = playing;
}

// Remembered as on from a visit before: the graph still cannot be made until
// the visitor does something, so it waits for the first click or key.
if (on && typeof window !== 'undefined') {
  const first = () => {
    window.removeEventListener('pointerdown', first);
    window.removeEventListener('keydown', first);
    if (on) setSound(true);
  };
  window.addEventListener('pointerdown', first);
  window.addEventListener('keydown', first);
}
