/** The Shelf's view of a Project. Serialised from the content collection by index.astro. */
export interface ShelfProject {
  slug: string;
  title: string;
  /** What the Spine is lettered with. The full title unless it is too long. */
  spine: string;
  eyebrow: string;
  tags: string[];
  summary: string;
  theme: string;
  /** The Project's device, already resized by Astro, or null if it has none. */
  art: { small: string; large: string } | null;
}

/** A labelled run of the Shelf holding the Projects of one Theme. */
export interface ShelfSection {
  theme: string;
  projects: ShelfProject[];
}

/**
 * Browsing  — the camera travelling the Shelf with one Box focused.
 * Inspecting— a Box held out of the Shelf, turned over and read.
 * Opened    — the front board swings on its hinge and hands over to the Write-up.
 *
 * There was a fourth, Power On: an unlit Shelf waiting for one deliberate
 * click. It was built, and it read as a gate rather than an invitation, so it
 * was removed. See docs/adr/0001.
 */
export type ShelfState = 'browsing' | 'inspecting' | 'opened';
