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
- **The payload budget in `docs/adr/0002` no longer holds.** A Draco-compressed carcass is
  trivial, perhaps 30KB, but a baked texture set is not. The budget is revised to **2.5MB
  initial payload**, from 1.5MB. Texture resolution is chosen to fit that, and the Flat
  Site still costs nothing, so nobody without WebGL pays for any of it.
- **`scripts/shelf.py` is the source of truth for the model**, and the exported `.glb` and
  baked textures are build artifacts committed alongside it. They are committed rather
  than generated in CI, because the GitHub Action should not need Blender installed.
- **Verification is by render.** Blender renders stills headless, so the model and its
  materials are judged from Cycles output before anything is wired into the site. Two
  directions were built all the way into the page before being looked at properly; this
  one gets looked at first.
