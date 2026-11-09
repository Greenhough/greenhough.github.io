/**
 * The books on the desk. Read ones, not Projects.
 *
 * A book in this scene means a Project — that is the site's one load-bearing
 * metaphor, and docs/adr/0004 argues at length for why four books that are
 * not Projects can sit here anyway. Three things have to be true at once and
 * all three are: they lie flat in a stack rather than standing spine-out in a
 * row, they are not on the Shelf, and their titles are other people's.
 *
 * They carry no asterisk. That mark is the site's own device, stamped at the
 * foot of a Project's Spine where a binder puts the publisher's; putting it on
 * Good to Great would be claiming it.
 *
 * No authors either. Three of the four I could name and the fourth I could
 * not, and a guessed author on a real book is worse than no author at all.
 */
export interface ReadBook {
  title: string;
  /** The binding. Chosen per book, not from a Theme: these are not Evan's. */
  cloth: string;
}

export const READ_BOOKS: ReadBook[] = [
  { title: 'Good to Great', cloth: '#4a4230' },
  { title: 'The Sales Enablement Framework', cloth: '#53382c' },
  { title: 'Gap Selling', cloth: '#3d3043' },
  { title: 'Atomic Habits', cloth: '#2e3d52' },
];
