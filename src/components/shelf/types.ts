/** The Shelf's view of a Project. Serialised from the content collection by index.astro. */
export interface ShelfProject {
  slug: string;
  title: string;
  /** How the binding is lettered, Spine and Cover. The full title unless it is too long. */
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

/**
 * The Shelf's view of a Post. The sheet of paper on the Desk shows the latest
 * one. Serialised by the page, the same way a Project is, so the room renders
 * content it does not own — see docs/adr/0005.
 */
export interface ShelfPost {
  slug: string;
  title: string;
  /** Already formatted by the page, so the room is not a second date format. */
  date: string;
  /** Plain text: the collection allows inline HTML and a canvas cannot draw it. */
  excerpt: string;
  readTime: number;
}

/**
 * Where in the room the camera is standing. The navigation moves between
 * these; within the Shelf, the Browsing and Inspecting states still apply.
 * See docs/adr/0004 for the views and docs/adr/0005 for the navigation.
 */
export type ShelfPlace = 'shelf' | 'desk' | 'console' | 'laptop';

/** A record in the Console: a sleeve to flip to and a song to play. */
export interface ShelfRecord {
  id: string;
  artist: string;
  song: string;
  album: string | null;
  /** The YouTube video id. */
  youtube: string;
  sleeve: string;
  ink: string;
}

/** One of the Board games stacked in the Console, as its side is lettered. */
export interface ShelfBoardGame {
  title: string;
  lettering: string;
  card: string;
  ink: string;
}
