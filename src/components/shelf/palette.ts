/**
 * The Shelf reads its colours from the site's stylesheet rather than repeating
 * them, so the 3D scene and the Flat Site can never drift apart. These fall back
 * to the known values if a custom property is missing.
 */
const FALLBACKS: Record<string, string> = {
  '--paper': '#FBFAF7',
  '--surface': '#FFFFFF',
  '--ink': '#14110C',
  '--body': '#3D3A33',
  '--muted': '#6A6453',
  '--faint': '#9A9384',
  '--green': '#1E7A4D',
  '--border': '#E2DDD0',
};

export function token(name: string): string {
  if (typeof document === 'undefined') return FALLBACKS[name] ?? '#000000';
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || FALLBACKS[name] || '#000000';
}

export const palette = () => ({
  paper: token('--paper'),
  surface: token('--surface'),
  ink: token('--ink'),
  body: token('--body'),
  muted: token('--muted'),
  faint: token('--faint'),
  green: token('--green'),
  border: token('--border'),
});

/**
 * Each Theme gets its own Section colour, used on the Spine and the Cover band
 * so a run of the Shelf reads as one group from across the room.
 */
export function themeColour(theme: string): string {
  const p = palette();
  return theme === 'Built for Work' ? p.ink : p.green;
}
