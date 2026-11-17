---
status: accepted
date: 2026-11-16
---

# The Room answers back: a lamp that switches, a clock, weather and sound

The Room was a photograph with a few things moving in it. Four things were added in one
go, and they share a reason: each makes the Room respond to something outside itself. The
visitor's hand, the visitor's hour, the day, and the visitor's ears.

Three models came with them, and the floor lamp moved, which changed how the Room is lit.
That part comes first because everything else stands on it.

## The floor lamp went to the corner, and the ceiling took over its job

The floor lamp stood in front of the Console, in the middle of the floor. It was there
because of `docs/adr/0004`: an evening room needs a visible lamp, and from there it raked
the Covers. It was also in the way of the Console, the Paintings and the plant, and it
read as a lamp put where the light was wanted rather than where a lamp goes.

It is now an arc lamp in the back right corner, behind the Monstera, its dome leaning out
over the plant and the end of the Console. That is where a lamp goes, and it cannot light
the Shelf from there. A black metal dome throws everything down, and from the corner the
carcass's own side stands between the bulb and the Books.

So the Room has a **Room light**: a flush opal fitting on the ceiling, out in front of the
Shelf and a little to its right. It does what the floor lamp did. It is out of frame from
the Shelf View, so the picture is still a room lit by lamps and a window; a phone, pulled
right back, sees it, and sees a ceiling light, which is the explained source
`docs/adr/0004` asked for.

What this costs is some of the evening. `docs/adr/0004` argued for two small sources well
apart, and a ceiling light is neither small nor to one side. It is kept low and warm, and
to the right, so the window still has the left of the Room to itself.

## Borrowed models are fetched, not committed

The floor lamp, the desk lamp and the clock are from BlenderKit, under its Royalty Free
licence: free to use in a project, not free to pass on as models. This repository is
public, so the models are not in it. `scripts/fetch-models.mjs` names each asset and
downloads it into `build/models/`, which is ignored, and `scripts/shelf.py` reads them
from there. Their geometry ships only inside `shelf.glb`, thinned to a few thousand
triangles and joined to the Room.

This is a different arrangement from the Monstera, which is CC BY and lives in `scripts/`.
The difference is the licence, not a change of mind.

It also means the bake needs the network once. `docs/adr/0003` already kept Blender out of
CI by committing what Blender makes, and that still holds: the fetch is a step before a
bake, on the machine that bakes.

## The desk lamp switches, because light adds

`docs/parked-room-ideas.md` parked "the Lamp switches off" as needing a second bake of
everything and a crossfade between the two, doubling the textures. That is true of
switching the Room's main light. It is not the way to switch a small one.

Light is additive. The Room lit by everything is the Room lit by everything else, plus the
Room lit by the desk lamp alone. So the Room is baked twice over the same unwrap:

- `room-bake`: everything except the desk lamp.
- `room-desk`: the desk lamp and nothing else. Every other lamp hidden, the sky off, every
  glowing surface dark.

The site adds the second to the first, in linear light, scaled by how far on the lamp is
(`ShelfModel.tsx`). On is exactly the Room with everything lit. Off is the first atlas.
There is no crossfade and nothing approximated.

The second atlas is black but for a pool on the Desk and what it bounces up the wall. It
is baked at half the Room's size and is a few tens of kilobytes as WebP.

Only the Room has it. The carcass and the Books at rest are baked with the lamp on: it
points away from them, and what it puts on the Shelf is too little to switch.

**The same method would switch the floor lamp, or dim the Room light.** Each is one more
small atlas. What it would not do is change the hour, because the hour is the Window, and
the Window lights everything.

The lamp is clicked, like the Bust, and like the Bust it is not a door: `docs/adr/0005`
says the Room's objects lead somewhere, and these two answer instead. `?lamp=off` starts
it off, so the Room without it is a URL.

## The clock tells the visitor's time

A clock on the left wall, over the Desk. (It was tried on the back wall over the Pinboard
first, and was one thing too many on that side of the Shelf.) Its case is baked. Its face and hands are
drawn live: a baked numeral would be three texels tall, and a baked hand cannot move.

It shows the hour where the visitor is. `docs/parked-room-ideas.md` parked the Prairie
following the visitor's hour, because a noon sky outside a dusk-lit Room is wrong and the
Room's light is baked. The clock is the part of that idea which needs no light. It says
what time it is for the visitor without the Room having to agree.

A frozen Room (`?t=`) shows ten past ten, so a still is repeatable.

## Weather is by the date, never by the place

Rain on the glass, or snow past it and on the fields, or most days neither
(`src/lib/weather.ts`). It is picked from the date and a number hashed from the date, so
it is the same all day and for everyone.

It could have been the weather where the visitor is. That means asking the browser where
they are, or sending their address to a weather service, to draw rain on a window. The
Prairie shows no real place and its weather is its own.

The Room's light does not change with it. An overcast dusk is still a dusk, which keeps
weather inside what one bake can pass for. `?weather=rain` asks for one.

## Sound is off until asked, and none of it is recorded

A switch in the nav. Off by default and remembered once changed.

Everything is made in the browser from noise, filters and a sine or two
(`src/components/shelf/sound.ts`): wind, rain, the clock, a Box sliding out, the Sheet, a
sleeve, the needle, the dice. No files to download, nothing to license, and a cue can be a
little different each time it plays.

Where the camera stands is where the listener stands. The window and the clock are loud at
the Desk and faint at the Console.

The Bust's voice stays outside this. It is a recording, it answers a click on him, and it
plays whether the switch is on or not.

## Consequences

- **A bake is now: fetch, bake, convert.** `node scripts/fetch-models.mjs` first, on a new
  machine. The full command is at the top of `scripts/shelf.py`.
- **`room.json` joins `box-bake.json`** as something the bake writes for the site: where
  each bulb is, where the clock hangs, the box round the desk lamp. The lamps are borrowed
  models stood and turned by the script, and their numbers could not be kept in step by
  hand the way the Console's are.
- **The model got smaller, not bigger.** Three borrowed models added about 150KB to
  `shelf.glb` over the wire. The Room and the carcass are drawn unlit, so their normals
  were never read, and the export now leaves them out: 505KB gzipped, against 536KB before
  any of this. `docs/adr/0002`'s 1.5MB budget stands.
- **The Books in the hand are lit from above now.** The live lights in `Scene.tsx` moved
  with the Room light, for the reason they moved in `docs/adr/0004`.
- **Sound cannot be judged from a still.** `docs/adr/0006` judges the Room by screenshot.
  Whether the rain sounds like rain is for an ear, which makes it Evan's to judge. What was
  checked by machine is that the graph runs and a signal comes out of it.
