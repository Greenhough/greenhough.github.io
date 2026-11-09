---
status: accepted
date: 2026-11-08
---

# The Shelf is modelled in Blender, with its light baked in

The Shelf shipped as code geometry with procedural materials, and it did not look
convincing. Two attempts to fix that failed. The first chased realism in code: oak painted
on a canvas, bevelled arrises, an environment built from emissive panels. It improved but
plateaued well short, because code geometry with a painted colour map has no surface
depth, no end grain, and above all no ambient occlusion, which is most of what makes a
render read as a photograph. The second abandoned realism for an 8-bit pixel style, which
was rejected outright.

The Shelf is now modelled in Blender, driven by a Python script, and most of its lighting
is baked into its textures.

Blender is scripted rather than hand-modelled, which answers the objection in
`docs/adr/0001` to imported models: a hand-authored Box means opening Blender every time a
Project is added, and the Shelf stops scaling. A **script** is still code. It lives in the
repository, it diffs, and `.glb` output is a build artifact, not a source file.

## The scene

Agreed before building, because guessing at it is what cost the two previous attempts:

- **A corner of a room.** Floor, one wall, the Shelf against it, the far edges falling off
  to the page colour so the room has no visible boundary. Also the groundwork for the
  entrance in a later deploy, which needs a room to walk into.
- **Daylight from a window.** One soft directional key with a clear direction, cool fill
  from the sky, warm bounce off the floor. Chosen over evening lamplight because the
  Covers are the content and they have to stay readable.
- **Its own palette.** Real wood, real wall and floor colours. The page stays cream and
  green around it. Constraining a real material to a brand palette is a large part of why
  the previous oak looked synthetic; the contrast between a flat editorial page and a
  solid, properly lit object is now the idea rather than the problem.

## Considered options

**Better procedural materials in code** was the incremental path: add a normal map derived
from the grain field, more light shaping. Rejected because the ceiling is still low.
Nothing in three.js at this budget produces baked ambient occlusion, and without it the
corners where boards meet stay flat and the whole thing stays CG.

**Downloading a CC0 model and PBR texture set** would have been faster than modelling.
Rejected because the Shelf has to fit Box dimensions that are themselves derived from
Project data, and a fixed model does not. A script parameterised on the same constants
does.

**Baking everything, including the Boxes** was rejected because the Boxes move: one slides
forward when focused, and one is held out of the Shelf for Inspecting. Baked light on a
moving object is wrong light.

## Consequences

- **Light is baked for what does not move, real-time for what does.** The room and the
  carcass carry baked lighting and ambient occlusion, so they look like a Cycles render at
  almost no runtime cost. The Boxes stay real-time, lit by an environment map exported
  from the same Blender scene so they sit in the same light. One real-time contact shadow
  grounds the focused Box.
- **The lighting is fixed.** The camera may still travel the Shelf, because baked lighting
  is a property of the surfaces rather than the view. But the time of day cannot change,
  and anything added to the scene later has to be lit to match or baked in its turn.
- **The payload budget in `docs/adr/0002` stands at 1.5MB after all.** This ADR originally
  revised it to 2.5MB on the assumption that a baked texture set would be heavy. Measured,
  it is not: the 2048 atlas is 2.1MB as a PNG but **84KB as WebP**, because baked wood is
  mostly smooth gradient and WebP compresses that almost away. With 306KB of JavaScript,
  ~70KB of Cover art and a Draco carcass of perhaps 30KB, the whole page lands near 500KB.
  The revision is withdrawn rather than left as unused headroom; a budget nobody is pushing
  against is not a budget.
- **`scripts/shelf.py` is the source of truth for the model**, and the exported `.glb` and
  baked textures are build artifacts committed alongside it. They are committed rather
  than generated in CI, because the GitHub Action should not need Blender installed.
- **Verification is by render.** Blender renders stills headless, so the model and its
  materials are judged from Cycles output before anything is wired into the site. Two
  directions were built all the way into the page before being looked at properly; this
  one gets looked at first.

## Addendum, 2026-11-09: Blender also shapes the Boxes, without baking them

The rule above still holds — the Boxes move, so their light is real-time — but it
was being read as "Blender has nothing to offer a moving object", and that is not the
same thing. Two things Blender makes are not light, and both now go on the Boxes.

**Shape.** A hardback's back is rounded, and rounding brings a groove for the board to
hinge in, a hollow behind the back, headbands closing the hollow, and a page block curved
to match. None of that is lighting; it is geometry that produces a highlight travelling
across the Spine as the camera moves, which is the single clearest signal that a Spine is
an object and not a label.

**A tiling cloth weave.** Baked as a normal map from a scripted weave, 256px and 46KB,
tiled across the Cover and the Spine of every Box. A normal map perturbs how real-time
light lands rather than storing light, so it is as correct on a moving object as on a
fixed one. It is what stops a painted Spine reading as paint: cloth is given away by the
light crawling over the threads, not by its colour.

The board game box is deleted from `scripts/shelf.py` rather than left beside the book.
It is recorded in `docs/adr/0001`; a cut direction kept as code is not documentation.

## Addendum, 2026-11-09: what "verification is by render" has to mean

The rule above says the model is judged from Cycles output before anything is wired into
the site, and that rendering the baked textures unlit is the honest test. Both still hold.
But building the room in `docs/adr/0004` showed the test as written was not honest, in two
ways that cancel out in a flat backdrop and do not cancel out in a room.

**A bake has no tone mapping, so the atlas clips at 1.0.** Blender's bake writes the raw
combined result and ignores the view transform. Cycles renders of the same scene went
through AgX, which rolls values over 1.0 gently back into range — so the lit render looked
well exposed while the atlas behind it had already lost a fifth of its texels to flat
white. The window was invisible in the baked room for exactly this reason: the glass and
the wall beside it had both clipped, and AgX was concealing it in every render used to
judge the lighting. `standard_view()` now turns the transform off for the baked render,
and the light levels were set against that, not against AgX.

**react-three-fiber tone maps the canvas, so the browser mapped it a second time.** Its
default is ACES, which is right for the Boxes — they are really lit, and their shader
output is scene-referred light that has to be mapped to a display. An atlas is not that:
it left Blender already mapped. Tone mapping it again lifted its midtones and crushed its
highlights, which is why the window read as a window in the atlas and as a white rectangle
in the browser. The baked materials now set `toneMapped: false`; the Boxes still do not.

So the honest test is specifically: bake, render it unlit with the transform off, and
check the clipped fraction. A render that merely looks right is the thing that hid this.

**Also worth knowing: where the window's light sits decides the bake's cost.** With the
area light behind the wall, every shadow ray from the room had to thread the opening and
most were stopped by the wall instead — the slowest case Cycles has, and a bake that took
thirty-five minutes. Moving it into the aperture brought that down to a few, with the same
picture. A few centimetres behind the glass rather than flush with it, so the reveal is
lit and the sill does not go black.
