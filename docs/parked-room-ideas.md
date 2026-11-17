# Parked: ideas for the Room

**Status: parked, not cancelled (2026-11-11).**

These came up while planning the objects in `docs/adr/0005`. Evan liked both enough to
keep and neither enough to build yet. Nothing here is designed.

> **2026-11-16:** part of this was built, a different way. The Desk lamp switches, and the
> Clock tells the visitor's hour: see `docs/adr/0008`. Neither needed a second bake of the
> Room. What is still parked is below, and the first idea has a cheaper answer now than the
> one written here.

## The Lamp switches off

Clicking the Lamp turns it off and the Room drops to the light of the Window alone.

- The Room's light is baked (`docs/adr/0003`), so this is not a matter of dimming a light.
  It needs a second bake of the Room, the Shelf and the Boxes with the Lamp off, and a
  crossfade between the two.
- That doubles the baked textures a visitor downloads, unless the second set loads only
  on the first click.
- The Live parts that are the Lamp's own light (its glow, its reflection in the Window
  glass) have to go out with it.
- ~~Open: whether the Desk's smaller lamp switches separately.~~ It does, and it is the
  only one that does.
- **A cheaper way than a second bake of everything:** `docs/adr/0008` switches the Desk
  lamp by baking its light alone as a small extra atlas and adding it. The floor Lamp
  could go the same way, and so could the Room light. Each is one more small atlas, loaded
  with the Room, with no crossfade.

## The Prairie follows the visitor's local time

The Prairie is painted at dusk. It could instead show the hour where the visitor is: dawn
for a morning visit, dusk in the evening, night after that.

- The Prairie is already painted by a script (`scripts/prairie.mjs`) and drawn live, so
  more hours means more paintings, or one painting whose colours are driven by the hour.
- The Room's baked light claims a fixed hour. A noon Prairie outside a dusk-lit Room would
  look wrong, so this likely needs the same extra bakes as the Lamp idea, or has to stay
  within hours the current bake can pass for.
- If both ideas are ever built, they should be designed together: they are the same
  problem, which is light that changes in a Room whose light is baked.

## Dropped, for the record

- A playable floor piano on the floor. Not wanted.
- A plant that grows a leaf per Project. Not wanted.
