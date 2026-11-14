/**
 * The Bust's voice: one recording of the Meditation, and how loud it is right
 * now, so the Bust can glow in time with it.
 *
 * Nothing is fetched until the Bust is first clicked. The click is the user
 * gesture browsers ask for before they will play sound, and a visitor who
 * never clicks him never downloads the clip.
 *
 * The level is read through Web Audio's AnalyserNode. If Web Audio is missing
 * or refuses, the clip still plays through the plain <audio> element and the
 * Bust simply does not pulse.
 */

let audio: HTMLAudioElement | null = null;
let analyser: AnalyserNode | null = null;
let samples: Uint8Array<ArrayBuffer> | null = null;
let context: AudioContext | null = null;

function element(src: string): HTMLAudioElement {
  if (audio) return audio;
  audio = new Audio(src);
  audio.preload = 'auto';
  try {
    const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Context) {
      context = new Context();
      const source = context.createMediaElementSource(audio);
      analyser = context.createAnalyser();
      analyser.fftSize = 512;
      samples = new Uint8Array(analyser.fftSize);
      source.connect(analyser);
      analyser.connect(context.destination);
    }
  } catch {
    analyser = null;
  }
  return audio;
}

/**
 * Speak the line from the start. `done(true)` when it finishes; `done(false)`
 * if it could not play at all (blocked, missing, offline), so the caller can
 * leave the words on screen instead.
 */
export function speak(src: string, done: (spoke: boolean) => void): void {
  const a = element(src);
  a.onended = () => done(true);
  a.currentTime = 0;
  void context?.resume();
  a.play().catch(() => done(false));
}

/** Stop mid-sentence. */
export function hush(): void {
  if (!audio) return;
  audio.onended = null;
  audio.pause();
  audio.currentTime = 0;
}

export function speaking(): boolean {
  return !!audio && !audio.paused && !audio.ended;
}

/** How loud the voice is this frame, 0 to about 1. */
export function voiceLevel(): number {
  if (!analyser || !samples || !speaking()) return 0;
  analyser.getByteTimeDomainData(samples);
  let sum = 0;
  for (const s of samples) {
    const v = (s - 128) / 128;
    sum += v * v;
  }
  return Math.min(1, Math.sqrt(sum / samples.length) * 4);
}
