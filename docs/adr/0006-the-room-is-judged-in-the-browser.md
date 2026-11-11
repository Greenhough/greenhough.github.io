---
status: accepted
date: 2026-11-10
---

# The room is judged in the browser, and the Books at rest are baked

The room was compared against a studio built from a single prompt, and looked worse.
The first guess at why was baked light, and it was wrong: this room has had baked light
since `docs/adr/0003`, from a pipeline that is if anything more careful. The difference
was in four other places, and this ADR changes all four.

## Verification is by screenshot of the page

`docs/adr/0003` says verification is by render: judge the model from Cycles output before
wiring it in. That rule was written after two directions were built into the page without
being looked at, and it fixed that. But it judges the model, and the visitor never sees
the model. They see the page: the bake compressed to WebP, drawn at their window size,
with real-time Books in front of it, a HUD over it and a camera that has stopped somewhere.
Every one of those was outside what a render shows.

So the page is now the thing that is judged, in a headless Chrome on the real GPU:

- `?t=<seconds>` freezes the room's clock (`src/components/shelf/clock.ts`). Everything
  that moves by itself reads that clock, and everything eased jumps to its target, so a
  still of an exact moment is repeatable. `/?t=0.4` is the lamps mid-strike;
  `/writing?t=30` is the Desk, settled.
- Every View already has a URL (`docs/adr/0005`), so a state is a URL plus a time.
- A round is: take three or more stills of different Views, moments and window sizes,
  read them, name the three weakest things, fix them, look again.

The Cycles render is still the fast loop for the model itself. It stopped being the
verdict.

## The Books at rest are baked

`docs/adr/0003` rejected baking the Books because they move, and baked light on a moving
object is wrong light. True of a Book in the hand. Never true of a Book on the Shelf,
which stands exactly where it was baked until somebody takes it down.

And a real-time Book in a baked room was the seam the eye found first. The room is soft,
path-traced, lit by two lamps. The Books in it were crisp, saturated and lit by an
environment map tuned to resemble those lamps. The studio's live parts were a monitor's
glow, dust and reflections, none of which has to match the room's light. Ours was the
subject of the scene.

So a Book has two ways of being lit (`src/components/shelf/bakedLight.ts`):

- **At rest**, its printing is multiplied by light baked in Blender for the slot it
  stands in. Light, not colour: the Cover and Spine are still painted in the browser per
  Project, so one light map serves whatever is printed.
- **In the hand**, it is lit live, as before.

One number runs between them with the Book's distance from its slot.

What this costs, and what it does not:

- `scripts/shelf.py` now reads `src/content/work/` to know which Project stands where,
  stands a Book in every occupied slot, and bakes with them there. So the carcass also
  gets their shadows and their colour, which it never had.
- **Adding a Project still does not need Blender.** `docs/adr/0001` made that a rule and
  it holds. `box-bake.json` records which Project was baked in which slot; a Project that
  is not in it, or has moved, is lit live exactly as every Book was before. The Shelf
  looks its best after a bake. It works without one.
- The Book carries a second UV set for the light. `book.glb` and the light atlas are
  written by the same run of the script from the same template, because two runs agreeing
  on an unwrap is a thing to not depend on.
- The canvas is no longer tone mapped. A baked surface left Blender already mapped to a
  display; ACES on top was only ever right for the live Books. With the canvas flat,
  printing times baked light is exactly what Cycles rendered, and the live lights are set
  to meet it.
- The room needed light it did not have. The site used to give the Books a warm key from
  the lamp's side. Baked, they get what the room really has, and the lamp's shade was
  opaque: the Spines were lit by bounce alone. A shade passes light sideways, so now this
  one does.

## A few things are live, chosen so they need no light

A bake is a photograph. What makes it a place is a handful of things that move, and the
rule for choosing them is that each is either light itself, or moves too little to need
relighting:

- **The Prairie**, on a plane four metres behind the glass. It slides against the window
  frame as the camera moves, which is the difference between a distance and a lit panel.
  The dusk gradient baked onto the glass is gone.
- **Glow** on the lamp shades and the laptop screen, and the same three **reflected in
  the window glass**: sprites at the mirrored positions, which sit behind the wall and so
  are only ever seen through the opening.
- **Dust** in the lamplight.
- **Leaves** that turn a degree, and a **record** that turns.
- **The lamps strike** when the room first draws, by scaling one colour every baked
  surface shares.
- **The camera leans** towards the pointer and drifts when there is none.

`docs/adr/0001` cut Power On for being a gate. The lamps striking is not one: nothing
waits on it and nothing is withheld.

## The words sit on the room

The HUD was a band of page colour over the bottom third of the scene. It is now light
text on a short dark fade. The room fills the window; the Flat Site underneath is
unchanged.

## The room is dressed

`docs/adr/0004` said density is where the richness comes from, and then the desk stayed
spare because a mug, papers and a pen pot were each turned down. They are still turned
down. What went in instead was asked for by name: a rug, a floor plant, a chair at the
desk, a console with a record player, two prints over it and one on top of the Shelf,
and a boarded floor in place of a flat brown one.

The prints are shapes, for the reason the pinboard is blank: a picture of something is a
claim about what is on Evan's wall.

## Consequences

- **The room atlas is 4096 on a desktop, 2048 on a phone.** More objects need more
  texels. The surfaces that run the depth of the room are squeezed past 2.7 units, where
  only a phone pulled right back looks, which bought back most of what the dressing cost.
- **`docs/adr/0002`'s budget should be measured again** after the full bake. The light
  atlas and the Prairie are new downloads.
- **A full bake is the best part of an hour on an M1.** `--gpu` is there for a machine
  with a real graphics card; on this one Metal was slower than the CPU.
- **The bake depends on content.** Re-run it when Projects are added or reordered, not
  because anything breaks, but because the new Book is lit differently from its
  neighbours until then.
