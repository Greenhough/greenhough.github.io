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
