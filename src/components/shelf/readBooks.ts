import books from '../../content/room/books.json';

/**
 * The books on the desk. Read ones, not Projects.
 *
 * A book in this scene means a Project — that is the site's one load-bearing
 * metaphor, and docs/adr/0004 argues at length for why four books that are
 * not Projects can sit here anyway. Three things have to be true at once and
 * all three are: they lie flat in a stack rather than standing spine-out in a
 * row, they are not on the Shelf, and their titles are other people's.
 *
 * They wear their real dust jackets: the front is the cover /books shows, and
 * the spine is lettered in the jacket's own colours. See the 2026-11-13
 * addendum to docs/adr/0005. Each book is shaped to its cover, so its width
 * comes from the cover's proportions in books.json rather than from here.
 *
 * They carry no asterisk. That mark is the site's own device, stamped at the
 * foot of a Project's Spine where a binder puts the publisher's; putting it on
 * Good to Great would be claiming it.
 *
 * scripts/shelf.py lays the same four out to bake their light, and reads the
 * same ids and books.json. The two have to agree.
 */
export interface ReadBook {
  /** Its entry in src/content/room/books.json, and its cover in public/assets/books/. */
  id: string;
  title: string;
  /** The author's name as the jacket's spine sets it. */
  byline: string;
  /** The jacket's ground, on the spine and the back. */
  jacket: string;
  /** The jacket's lettering on the spine. */
  ink: string;
  /** The cover's width over its height. */
  aspect: number;
}

const ON_DESK = [
  { id: 'good-to-great', byline: 'Collins', jacket: '#e5242a', ink: '#ffffff' },
  { id: 'deep-work', byline: 'Newport', jacket: '#f0c419', ink: '#141414' },
  { id: 'gap-selling', byline: 'Keenan', jacket: '#d81f30', ink: '#ffffff' },
  { id: 'atomic-habits', byline: 'Clear', jacket: '#ede7e1', ink: '#8a6a45' },
];

/** Bottom of the stack first. */
export const READ_BOOKS: ReadBook[] = ON_DESK.map((book) => {
  const entry = books.find((b) => b.id === book.id);
  if (!entry) throw new Error(`${book.id} is on the desk but not in books.json`);
  return { ...book, title: entry.title, aspect: entry.cover.width / entry.cover.height };
});

export const coverFor = (book: ReadBook) => `/assets/books/${book.id}.webp`;
