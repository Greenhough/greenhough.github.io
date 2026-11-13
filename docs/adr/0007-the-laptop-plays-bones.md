---
status: proposed
date: 2026-11-13
---

# The Laptop plays Bones

`docs/adr/0005` left the Laptop as "undecided, waiting on what it should show". It now has
an answer: a two-player dice game, Bones, played against the computer on the Laptop's
screen. Its rules are those of Knucklebones, the minigame in *Cult of the Lamb* by Massive
Monster, and the game says so.

## The name, and the credit

The game is called **Bones**, an old word for dice. It is not called Knucklebones, because a
game with that name and those rules would present itself as a copy of someone else's game
rather than a homage to it. The rules are borrowed openly instead: the rules panel opens by
naming Knucklebones, *Cult of the Lamb* and Massive Monster, and links to the game. Evan
did not invent this game and nothing on the page suggests he did.

The look is the Room's own, not the original's. Bones runs as a program in the editor
already drawn on the Laptop's screen: the same dark palette, monospace lettering, dice as
pips. No art, characters or music from *Cult of the Lamb*.

## One source, two renderers

`docs/adr/0005` says nothing may live only in the Room, and a game is no exception.

- **The rules and state are a plain TypeScript module**, `src/lib/bones.ts`, with no React
  and no Three. Its tests run with `npm test` (Node's own test runner, no dependency).
- **One React component draws the board** from that state, as ordinary DOM.
- **`/play` is a real page** that renders that component on the Flat Site. It works
  without WebGL, on a phone and for a reduced-motion visitor.
- **In the Room**, the same component is set on the Laptop's screen with drei's `Html`,
  turned to the lid's lean, and only takes input at the Laptop View. Elsewhere the screen
  shows the editor, with Bones idling in a pane: dice settling, a score ticking over. That
  is the quiet highlight `docs/adr/0005` asks for in place of a key hint.

## A View of its own

A game is not read, it is played, and "showing is not reading" cuts the other way here: a
board four hundred pixels wide on a tilted plane is worse than the page. So the Laptop gets
a View, close enough that the screen fills the frame, and its URL is `/play`. On a phone
the camera does not try: `/play` opens as the page.

This raises the ceiling `docs/adr/0005` set. Shelf, Desk, Console and the Pinboard's View
were to be the last; the Laptop makes one more. That is accepted on the grounds the ceiling
was set on: it bounds composed frames worth maintaining, and this one is a single frame on
an object that already exists and already draws live.

## The opponent

Faceless: the computer, in the editor. It scores each column it could place in by what it
gains, what it takes off the board, and what it leaves exposed, then adds a little noise so
it can be beaten. Difficulty levels can come later if the one level is wrong.

## Consequences

- `/play` joins the Views' URLs. Without JavaScript it is the page; with the Room live, a
  click on the Laptop moves the camera and pushes it.
- Nothing about Bones is content, so nothing is added to a collection. A win and loss count
  may be kept in `localStorage`, per visitor, and is allowed to vanish.
- No sound by default. A dice rattle, if one is added, is opt-in.
