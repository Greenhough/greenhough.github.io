---
status: accepted
date: 2026-11-04
---

# The 3D Shelf replaces the flat home page

The site's purpose changed: it is no longer an audition for a Sales Enablement role,
it is a place to show things Evan built with AI in his free time. That reframing makes
the home page's job *being interesting*, not *being skimmable in ninety seconds*, so the
flat card grid is replaced by a 3D board game Shelf where each Project is a Box.

## Considered options

Keeping the flat home page and putting the Shelf at its own route was the safe choice,
and was the original plan. It was rejected because a 3D experience nobody lands on is a
demo, not a home page — and under the old framing the whole point of the safe choice was
protecting a hiring manager's first impression, which is no longer an audience we are
designing for.

A Monopoly- or Catan-style board was rejected on three grounds: both are live trademarks;
a fixed board forces fixed geometry that does not grow as Projects are added; and
"roll to find his work" is a hostile navigation model. A shelf of Boxes scales by adding
one Box.

## Consequences

- **The Flat Site is a peer, not a leftover.** Crawlers, reduced-motion visitors and
  browsers without WebGL get the same content as ordinary HTML, rendered at build time.
  First paint never waits on WebGL. Phones get the real Shelf at reduced settings — the
  Flat Site is not a mobile consolation prize.
- **Every state is a URL.** `/` is Browsing, `/box/{slug}` is Inspecting, `/{slug}` is
  the Write-up. A 3D scene that swallows the back button is the most common way these
  sites feel broken.
- **Covers become real design work.** Five hand-designed Covers, built from one template
  so the sixth is cheap. Spines are generated from Project data.
- **Boxes stay code geometry** even though the Shelf and other props are imported models.
  The moment a Box is a hand-authored model, adding a Project means opening Blender and
  the Shelf stops scaling.

## Addendum, 2026-11-05: Power On was built and removed

The Shelf shipped without **Power On**, the single deliberate click that was to take the
scene from unlit to lit. It was built as specified and cut after seeing it: on screen it
read as a gate rather than an invitation, clunky and tacked on. `/` now lands lit, in
Browsing, and the term is gone from `CONTEXT.md`.

The instinct behind it still stands. An entrance is wanted, but a better one: opening a
door and walking into a board game room. That is deferred to a later deploy, so this is a
removal rather than a replacement — a stand-in gate built now would only be something the
door deletes.

Two other things stand in for what this ADR asks, pending real work: **Covers are
generated from one template** rather than hand-designed, and **the Shelf is code geometry**
rather than an imported model. Both are swaps, not rewrites, when the art exists.

## Addendum, 2026-11-09: Boxes are books

A Box is now a clothbound hardback rather than a board game box. The board game box was
built and cut: its lid seam ran across a third of the face, which is not how a game box is
made, and the form gave the eye nothing to hold onto.

A shelf of books is a more natural object than a shelf of game boxes, and the vocabulary
already fitted — Cover and Spine are book words before they are game words. What a book
adds is a page block and the square, the overhang of the boards past the pages, and those
are the two things a slab cannot fake.

The term **Box** stays. It names the slot a Project occupies on the Shelf, not a claim
about what that slot looks like, and renaming it through the codebase would cost more than
it is worth. `CONTEXT.md` records the change in form.

**Opened** changes with it: the front board swings open on a hinge at the spine, rather
than a lid lifting off. The model carries the hinge, so the site rotates a board rather
than spinning one about its middle.

The Shelf itself is no longer code geometry either; see `docs/adr/0003`. The Boxes being
modelled does not reopen the objection above, because there is **one** scripted book that
every Project reuses, and the Cover and Spine are still painted per Project in the browser.
Adding a Project is still a Markdown file.

## Addendum, 2026-11-09: the Cover is a cloth case, and the art is a Device

"Covers become real design work. Five hand-designed Covers" is withdrawn. The
Cover was the last part of the Box still drawn as a board game box — a publisher's
band across the top, the art in a window, the title under it, the tags along the
bottom edge standing in for player count and play time — and it survived the pivot
to books only because nobody had looked at it since.

It is now what the Spine is: cloth, with a blind frame pressed into it, the title
blocked on it and the tags at the foot. There is no art window.

That is not only a change of layout. Of the five images in `src/assets/covers/`,
three were UI screenshots at wide aspect ratios — a dashboard at 2880x1400 among
them — and no frame rescues a dashboard seen at two hundred pixels. A screenshot is
evidence and a cover is a sign; the evidence was already in the Write-up, and every
one of those five files was byte-identical to an image the Write-up already served.

So `cover` becomes **optional**, and means a **Device**: one flat mark blocked on the
cloth. Quibble has one. The other four are blind-stamped and carry the site's
asterisk until a mark is drawn for them, which is a far smaller job than designing a
cover and is a file drop when it is done.

A dust jacket was considered, since a jacket is where art lives on a real hardback
and it would have kept the screenshots. Rejected for now: a jacket covers the
spine, so it replaces the binding rather than building on it, and there is no point
wrapping a good binding round a screenshot.
