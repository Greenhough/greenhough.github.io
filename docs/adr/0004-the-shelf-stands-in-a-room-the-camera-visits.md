---
status: proposed
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

- **One room, seen from a doorway.** Four surfaces that actually end: a floor with an
  edge, two walls, a doorway. Not a large space — a room you could photograph from one
  corner.
- **A window**, on the wall the daylight already claims to come from. The light in the
  scene is currently unexplained; a window explains it and is the single object that
  does most for the room.
- **A desk with work on it.** Papers, a mug, the things that accumulate. This is where
  **Posts** live, and Posts have never had a physical home: they are the one kind of
  content the Shelf cannot hold.
- **A pinboard or posters** on the wall. Cheap to model, carries personality, and can
  hold real artwork later.
- **Plants and clutter.** Objects with no navigational job at all. This is the part that
  makes it a room rather than a diagram, and it is the part most likely to be cut for
  being "not load-bearing". It is load-bearing.

**Daylight stays.** `docs/adr/0003` chose baked daylight so the Covers stayed readable,
and although that reason has weakened — the Covers are cloth with blocked lettering now,
not screenshots — keeping it means the Shelf and room already baked do not have to be
baked again. The reference is a night scene and its mood is largely the night. We are
taking its *density*, not its hour.

## How the camera behaves

It does not roam. There is no walking, no orbit, no free look. The camera moves between
a small number of fixed, composed views, each one a place in the room:

| View | What it frames |
|---|---|
| Doorway | The whole room, on arrival |
| Shelf | The Shelf, as the current rig frames it |
| Desk | Posts |
| Board | The pinboard |

The navigation drives it. `Work` goes to the Shelf, `Writing` goes to the Desk. A view
is a camera position and a target, authored by hand, and adding one is adding a row.

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

- **The backdrop becomes a room, so its edges become real.** The far-edge fade to page
  colour works because the camera only ever looks one way. Once the camera visits a desk
  and a board, it will see where the floor stops. Either the room gets a boundary that
  bears looking at, or the fade is tuned per view — and the second is a trick that will
  need maintaining every time a view is added.
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

## Open

- **The floor's edge** has no answer yet. A rug and a chair were offered and not taken, so
  the room needs some other reason for the floor to stop.
- **The board's job.** It is dressing in this ADR. It could be navigation — About, or
  whatever a fourth view would be — and the site has no About page today.
- **Whether the desk is where Posts are read** or only where the link to them lives.
