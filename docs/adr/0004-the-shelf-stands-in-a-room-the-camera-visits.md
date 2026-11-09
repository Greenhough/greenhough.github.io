---
status: accepted
date: 2026-11-09
---

# The Shelf stands in a room the camera visits

The Shelf is an object with a backdrop behind it: a floor, one wall, and far edges
fading to the page colour so the room has no boundary. That was the right call when
the Shelf was the whole idea. It stops being the right call the moment anything else
in the site wants a place to be.

Two things pushed this. The entrance from `docs/adr/0001` — opening a door and walking
into a room — was deferred because there was no room to walk into. And `felixrieseberg.com`
showed what the thing we actually want looks like: a desk at night, dense with small
believable objects, the camera moving between framed views of it as the navigation is
used. Its scene is not large. It is **dressed**, and that is where the richness comes from.

So: the Shelf stands in a room, and the navigation moves the camera to places in that
room.

## What the room is

Agreed before building, because guessing at it is what cost the two attempts recorded
in `docs/adr/0003`:

- **One room, closed.** Three walls that meet the floor at a skirting board, and a
  doorway. The floor stops because the room stops, which is the only answer to its edge
  that does not need maintaining once views are added. Not a large space — a room you
  could photograph from one corner.
- **A window**, on the wall the daylight already claims to come from. The light in the
  scene is currently unexplained; a window explains it and is the single object that
  does most for the room.
- **A desk with work on it.** A mug, the things that accumulate, and **the latest Post**
  as a single sheet, painted per Post the way a Box is painted per Project. Clicking it
  opens that Post; everything older is a link. Posts have never had a physical home —
  they are the one kind of content the Shelf cannot hold — and this gives them one
  without the desk having to hold an unbounded and growing number of them.
- **A stack of books on the desk**, lying flat: *Atomic Habits*, *The Sales Enablement
  Framework*, *Good to Great*, *Gap Selling*. Real books, read ones, not Projects. See
  below, because a book in this scene already means something specific.
- **A pinboard** on the wall, with real pictures pinned to it. Dressing, deliberately:
  it is not navigation and nothing on it is clickable. The site has no About page for a
  fourth view to point at, and a board that is only looked at can be given a job later
  without undoing anything.
- **Plants and clutter.** Objects with no navigational job at all. This is the part that
  makes it a room rather than a diagram, and it is the part most likely to be cut for
  being "not load-bearing". It is load-bearing.

**Daylight stays.** `docs/adr/0003` chose baked daylight so the Covers stayed readable,
and although that reason has weakened — the Covers are cloth with blocked lettering now,
not screenshots — keeping it means the Shelf and room already baked do not have to be
baked again. The reference is a night scene and its mood is largely the night. We are
taking its *density*, not its hour.

## The desk's books are not Projects

A book in this scene means a Project. That is the site's one load-bearing metaphor and it
was arrived at expensively, so putting four books on the desk that are *not* Projects is
worth being deliberate about rather than letting it happen as dressing.

It holds, for three reasons that all have to be true at once:

- **They lie flat in a stack.** A Project stands on the Shelf, spine out, in a row of its
  own kind. A pile on a desk is not that shape and does not read as that row.
- **They are not on the Shelf.** The Shelf is the thing `Work` goes to. Nothing on the
  desk is in it.
- **Their titles are other people's.** *Good to Great* is visibly not something built here,
  which is the whole point of them being there.

They are also nearly free: the same `book.glb` the Boxes use, turned on its side, lettered
by the same `paintSpine` that letters a Project — which is what a stack shows you anyway.

If they ever do read as Projects, the fix is to stop lettering them rather than to remove
them. A visitor clicking one and getting nothing is the failure to watch for.

## How the camera behaves

It does not roam. There is no walking, no orbit, no free look. The camera moves between
a small number of fixed, composed views, each one a place in the room:

| View | What it frames |
|---|---|
| Doorway | The whole room, on arrival |
| Shelf | The Shelf, as the current rig frames it |
| Desk | The latest Post, and the books |

The navigation drives it. `Work` goes to the Shelf, `Writing` goes to the Desk. A view
is a camera position and a target, authored by hand, and adding one is adding a row.
There is no view for the pinboard: it has no nav item to be reached by, so it is seen
in frame from the Doorway rather than visited.

This is also what the entrance becomes. **The door is already open and the first frame is
the doorway.** The camera's first move, doorway to Shelf, is the entrance — there is no
click, no gate, and nothing is withheld. That is the difference between this and **Power
On**, which was cut for reading as a gate: you can see the whole room the entire time,
and the move happens whether or not you do anything.

## The move covers the load

The room, the Shelf and the carcass are one baked model and arrive together. The Boxes do
not: they are real-time, and their Covers and Spines are painted in the browser, per
Project, after the fonts resolve.

So there is a window — short, but real, and longest on a phone — where the room exists and
the Boxes do not. The camera's move from the doorway to the Shelf happens during exactly
that window, and it ends looking at Boxes that have arrived. The entrance is not decoration
with a loading spinner hidden behind it; it is the load, given something to be.

If the Boxes are ready early the move still plays, because a transition that fires only on
slow connections is a transition nobody tests.

## Considered options

**A single fixed frame.** The reference very nearly is one, and it would be the cheapest
and hardest to get wrong. Rejected because the Shelf already moves along its Sections, and
because a fixed frame gives Posts nowhere to go — the desk would be set dressing for
content you can only reach through a text link.

**Walking through the room.** Free movement, the thing "walking into a room" literally
describes. Rejected because it needs a room built to be walked around rather than looked
at, it makes every surface and every corner load-bearing, and the reference achieves more
than this with a camera that never leaves its rails.

**Going to night.** Strongly considered, since it is where the reference's atmosphere
comes from and the original objection has weakened. Deferred rather than rejected: it means
re-baking everything, and the room should be proven in the light we already have before
its hour is changed. If night is wanted later, it is a re-bake and a palette, not a rebuild.

## Consequences

- **The far-edge fade goes.** It worked because the camera only ever looked one way, and
  it was a per-view trick waiting to happen. Closing the room retires it: the boundary is
  a wall and a skirting board, which bears being looked at from any view and needs no
  tuning when a view is added.
- **The camera sets the room's size, not taste.** `Scene.tsx` pulls the camera back up
  to 2.2x on a phone held upright, which puts it 9.68 units from the Shelf — outside the
  room, looking in through the open fourth side. The room has to be deep enough that the
  camera's cone still passes through that opening, which is what fixes it at 7.4 deep
  rather than at whatever a room of this width would otherwise be. A phone wants a wider
  lens, not more distance; swapping the pull-back for a wider field of view would let the
  room shrink, and that belongs with the views.
- **The bake gets bigger.** More surfaces, more atlas. `docs/adr/0002`'s 1.5MB budget stands
  and is not in danger yet — the page is near 600KB — but the room is the first thing that
  could threaten it, and the atlas should be measured per addition rather than at the end.
- **Everything added has to be lit to match.** This was already true of baked light. It is
  more binding now, because a room full of objects has many more chances to disagree.
- **Views are content.** A camera position is authored, named and committed, the same way a
  Project is. If adding a Project ever means authoring a view, this ADR has failed and the
  Shelf has stopped scaling.
- **It is built in pieces, each one shippable.** Room shell and window first, with the
  camera unchanged; then the dressing; then the views and the navigation; then the doorway
  move. Nothing here needs to land at once, and the history of this scene says that things
  which land at once do not get looked at properly.

## Addendum, 2026-11-09: the room goes to evening

"Daylight stays" above was deferred rather than rejected, with the note that if the room
worked in the light we already had and still felt flat, going to evening was a re-bake and
a palette rather than a rebuild. The room shell shipped, and the window read as a backlit
panel: a flat even blue with nothing behind it, cold against warm oak, with a blown halo
on the wall around the opening. A daylit window is a hard thing to make convincing,
because it has to stand in for a whole sky. A night window is a dark rectangle with glow
in it, which is a far easier promise to keep — and the atmosphere being chased here was
always the night one.

Two of the three reasons for keeping daylight have now gone. The Covers stopped being
screenshots, so their readability no longer depends on being brightly lit. And the bake
is minutes rather than half an hour, since the window's light moved into its aperture, so
a re-bake is no longer a reason to avoid anything.

**A practical light becomes load-bearing.** This is the part that is not just a palette.
With only a dusk window the room goes nearly black and the Shelf disappears, so the room
needs a lamp — and it has to be a visible lamp, because an unexplained pool of light is
the exact fault the window was added to fix. It stands camera-right, so the warm lamp and
the cool window bracket the Shelf from opposite sides. Cross-lighting of that kind is most
of why evening interiors look like anything at all.

**The Boxes have to be retuned with it.** They are real-time, and `Scene.tsx` lights them
with an environment built to match baked daylight: warm key where the window is, cool sky
opposite, warm bounce off the floor. Left alone, that environment puts a daylit Box in a
night room, which is the "second sun" fault in `docs/adr/0003` wearing a different hat.
The environment moves with the bake or neither is right.

The order follows from this. Evening is built before the dressing rather than after it,
because the desk, the books and the clutter all have to be lit by the light they will
ship under — otherwise they get made twice.
