---
status: accepted
date: 2026-11-10
---

# The room's objects are doors

`docs/adr/0004` built a room the camera visits, and was explicit that the things in it
were dressing: the pinboard "is not navigation and nothing on it is clickable", and the
reference site's layer of `C use computer · M use CD player` was called "a layer sitting
on top of that structure, not the structure". That was right at the time and it is being
overturned now, on purpose rather than by drift.

Seeing the room furnished changed the answer. A desk with a lamp on it and a stack of
books that say what you read are not neutral: they look like things, and things that look
like things invite being used. The pinboard in particular reads as a blank space waiting
for a job, which is what it was.

So the objects in the room become ways in:

| Object | Leads to | Status |
|---|---|---|
| Shelf | Projects | built |
| Desk | Posts, as a sheet of paper | this ADR |
| Book stack | Favourite books, by kind | planned |
| Pinboard | About, with real photographs | planned |
| Record or player | A song, as an embedded video | planned |

## One source, two renderers

This is the rule that makes the rest safe, and it is not negotiable without undoing
something the site already promises.

`CONTEXT.md` defines the Flat Site as "a peer of the Shelf, not a degraded copy of it".
`docs/adr/0001` says every state is a URL. Together those mean content can be *shown* in
the room but may never *live* only in the room: anything that exists solely inside WebGL
is invisible to a crawler, to a reduced-motion visitor, and to anyone whose machine will
not run it, and at that point the Flat Site has quietly become a fallback.

So every one of the objects above renders content that is already an Astro collection or
page. A Project is a markdown file; the Shelf draws it as a Box, `/work` draws it as a
row, and `/box/{slug}` draws the whole write-up. Posts, books, the About and the song all
follow that shape. The room is a renderer, not a store. Nothing is authored twice: one
content model, two presentations of it.

**Showing is not reading.** The room shows the thing — a Post's title, date and opening
lines on the sheet — and reading the whole of it goes to the page. A long article on a
plane in 3D is worse than a page, and calling that "interactive" would be using the word
to mean "harder".

## The navigation moves the camera

`Work` goes to the Shelf and `Writing` goes to the Desk, as `docs/adr/0004` set out. What
that ADR did not settle is how it coexists with the Flat Site, and the answer was already
in the codebase rather than needing inventing.

`/box/{slug}` is a real page that renders the Flat Site's content and carries the Shelf as
an overlay, booting it with that Box inspected. `/work` and `/writing` now do the same
with a view instead of a slug. The nav keeps real `href`s, so without JavaScript they are
ordinary links to ordinary pages; with the room live, a click moves the camera and pushes
the same URL instead, and a reload lands back where it was. Every view is a URL, which is
what `docs/adr/0001` asked for.

## Consequences

- **The nav does not grow to five items.** `Work`, `Writing` and eventually `About` are
  navigation. The book stack and the song are found by looking at the room, with a quiet
  highlight on whatever is clickable. No key hints and no on-screen list of controls:
  that is the part of the reference site that was explicitly not wanted, and it is still
  not wanted.
- **Every new object needs a view, and views are authored by hand.** `docs/adr/0004`
  warned that if adding a Project ever means authoring a view, the Shelf has stopped
  scaling. That still holds and is unaffected: a Project is a Box on an existing Shelf.
  But an *object* is a view, so the number of objects is bounded by how many composed
  frames are worth maintaining. Five is the ceiling this ADR is comfortable with.
- **The song is an embedded video, not audio.** Playing a commercial recording on the
  site needs a licence for that recording; linking to it or embedding the publisher's own
  player does not. Embedding brings Google's player and its tracking with it, which is
  the cost that was accepted in choosing it.
- **The pinboard is blocked on real photographs.** It cannot be built from nothing, and
  inventing images to fill it would be inventing content.

## Built in pieces

Views and the navigation first, with the sheet of paper on the desk as the only
interactive object, so the camera system and the way an object opens are settled once.
The book stack, the pinboard and the song are then repeats of a proven pattern rather
than three separate inventions. The doorway move stays last, as `docs/adr/0004` has it.

## Addendum, 2026-11-11: the Console

The Console is the third View, and it holds two doors rather than one.

| Object | Leads to | Status |
|---|---|---|
| Shelf | Projects | built |
| Desk | Posts, as a sheet of paper | built |
| Book stack | `/books` | built, as a placeholder list of the four in the stack |
| Record player and Sleeves | `/music`, the Console View | built |
| Board games | `/board-games` | built |
| Pinboard | About, with real photographs | planned, last |
| Laptop | undecided | waiting on what it should show |

- **Sleeves, not one song.** The row is flipped through and any record can be put on.
  Nothing is asked of YouTube until one is, so the tracking this ADR accepted arrives
  only with the first song, and through the no-cookie player.
- **No album art and no box art.** Sleeves and Board games are lettered in the room's
  own hand. A cover belongs to whoever made it; a name does not.
- **The record turns only while a song is on.** It used to turn always, as dressing. Now
  that it is a door, its turning says something.
- **The Paintings are real paintings.** `docs/adr/0004` kept the Prints abstract because
  inventing what hangs on Evan's wall would be inventing content. He has now said what
  hangs there, so the rule is kept rather than broken.
- **The Bust is dressing.** A fifth View is the ceiling and the Pinboard has the last one.
- The Lamp switching off and the Prairie following the hour are parked in
  `docs/parked-room-ideas.md`.

## Addendum, 2026-11-13: the Bust answers

The Bust stays dressing and still has no View, but clicking it from the Shelf puts one
line of the *Meditations* in the HUD, in the place a focused Box's title would go. The
camera does not move, nothing is pushed to the URL, and picking anything else puts it
away. It does not spend the fifth View, which is still the Pinboard's.

The line follows the one-source rule: it lives in `src/data/meditation.ts`, and the Flat
Site carries it on the 404 page. It is Gregory Hays's wording, so it is credited to him
in both places.

Later the same day the Bust was given a voice. He now says the line aloud (an ElevenLabs
voice, with a little stone-room reverb added offline) and the HUD shows it as a subtitle
that fades a moment after he finishes. Clicking him again stops him. A bust cannot move
its lips, so he brightens in time with the voice instead. The words stay on screen
whenever the sound cannot play, so the line never depends on audio, and the clip is only
fetched on the first click.

## Addendum, 2026-11-13: /books shows real covers

`/books` is now the full list, three books to a topic, each with its real cover and its
title under it. That is a deliberate exception to "no album art and no box art", and it is
scoped: the rule is about the Room, where Sleeves and Board games are lettered in the
Room's own hand, and it still holds there. The Book stack on the Desk stays lettered.

On a Flat Site page a cover is how a reader recognises a book, and a list of books read
is the ordinary place covers are shown. They come from Open Library (or the publisher
where Open Library had none), resized to 300 wide and kept in `public/assets/books/`, so
a visitor's browser never asks a third party for them. The list lives in
`src/content/room/books.json`.

The same exception now covers `/board-games`: each ranked game shows its box beside it.
The images come from the publishers' own product pages (or Asmodee, their distributor,
where the publisher no longer sells it), trimmed and kept in `public/assets/board-games/`.
The Board games in the Room are still lettered, with no box art.
