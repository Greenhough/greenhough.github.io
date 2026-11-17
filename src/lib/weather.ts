/**
 * What the weather is on the Prairie today.
 *
 * Picked by the date and by chance. Not by where the visitor is: the Prairie
 * shows no real place, and asking a browser where someone is in order to draw
 * rain on a window is a great deal to ask for very little.
 *
 * The chance comes from the date as well, so it is the same all day. A visitor
 * who reloads, or comes back after lunch, finds the weather they left.
 */
export type Weather = 'clear' | 'rain' | 'snow';

/** A number from 0 to 1 that is the same all day and unrelated the next. */
export function dayChance(date: Date): number {
  let n = date.getFullYear() * 372 + date.getMonth() * 31 + date.getDate();
  // The finishing rounds of MurmurHash3, so that tomorrow's is nothing like
  // today's. A weaker mix gave runs of near-identical days.
  n = Math.imul(n, 0x9e3779b1);
  n = Math.imul(n ^ (n >>> 16), 0x85ebca6b);
  n = Math.imul(n ^ (n >>> 13), 0xc2b2ae35);
  n = (n ^ (n >>> 16)) >>> 0;
  return n / 0x100000000;
}

/**
 * The weather on a date. Snow from December to February about one day in two,
 * a little of either in March and November, and rain the rest of the year
 * about one day in three. Most days are clear, because weather that is always
 * there is a wallpaper.
 */
export function weatherOn(date: Date, chance: number = dayChance(date)): Weather {
  const month = date.getMonth();
  if (month === 11 || month <= 1) return chance < 0.5 ? 'snow' : 'clear';
  if (month === 2 || month === 10) return chance < 0.22 ? 'snow' : chance < 0.45 ? 'rain' : 'clear';
  return chance < 0.33 ? 'rain' : 'clear';
}
