/**
 * What the Bust says when it is clicked.
 *
 * One source, two renderers (docs/adr/0005): the Room shows it in the HUD when
 * the Bust is clicked, and the Flat Site carries it on the 404 page, where a
 * line about obstacles becoming the way is at home. It never lives only in
 * the Room.
 *
 * The wording is Gregory Hays's translation (Modern Library, 2002), so it is
 * credited to him. A single line, quoted and credited, is all this is.
 */
export const MEDITATION = {
  text: 'The impediment to action advances action. What stands in the way becomes the way.',
  author: 'Marcus Aurelius',
  source: 'Meditations 5.20',
  translator: 'Gregory Hays',
  /** The Bust says it aloud in the Room. Voice made with ElevenLabs ("Silas"). */
  audio: '/assets/audio/meditation.m4a',
} as const;
