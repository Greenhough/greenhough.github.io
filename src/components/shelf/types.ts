/** The Shelf's view of a Project. Serialised from the content collection by index.astro. */
export interface ShelfProject {
  slug: string;
  title: string;
  eyebrow: string;
  tags: string[];
  summary: string;
  theme: string;
  /** Cover art, already resized by Astro. Two sizes: phones get the small one. */
  art: { small: string; large: string };
}

/** A labelled run of the Shelf holding the Projects of one Theme. */
export interface ShelfSection {
  theme: string;
  projects: ShelfProject[];
}

/**
 * Power On  — unlit, waiting for the one deliberate click.
 * Browsing  — lit, camera travelling the Shelf with one Box focused.
 * Inspecting— a Box held out of the Shelf, turned over and read.
 * Opened    — the lid lifts and hands over to the Write-up.
 */
export type ShelfState = 'power-on' | 'browsing' | 'inspecting' | 'opened';
