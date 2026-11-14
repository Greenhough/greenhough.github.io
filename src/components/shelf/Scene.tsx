import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import { Box, BOX } from './Box';
import { SHELF, SectionLabel, sectionFloorY, slotX } from './ShelfUnit';
import { ShelfModel } from './ShelfModel';
import { BookStack } from './BookStack';
import { palette } from './palette';
import { Paper } from './Paper';
import { Sticker } from './Sticker';
import { Console } from './Console';
import { Atmosphere, Laptop, SCREEN_CENTRE, SCREEN_NORMAL, SCREEN_UP } from './Atmosphere';
import { boxTile } from './bakedLight';
import { easeFor, isFrozen, roomTime } from './clock';
import { applyOrbit, useOrbit } from './useOrbit';
import type {
  ShelfBoardGame,
  ShelfPlace,
  ShelfPost,
  ShelfRecord,
  ShelfSection,
  ShelfState,
} from './types';

interface Props {
  sections: ShelfSection[];
  focusedSlug: string | null;
  state: ShelfState;
  place: ShelfPlace;
  post: ShelfPost | null;
  textureSize: number;
  /** A phone gets the smaller room atlas. */
  phone: boolean;
  onFocus: (slug: string) => void;
  onPreview: (slug: string) => void;
  onInspect: (slug: string) => void;
  onOpenPost: (slug: string) => void;
  onHover: (hovering: boolean) => void;
  records: ShelfRecord[];
  recordIndex: number;
  boardGames: ShelfBoardGame[];
  onVisitConsole: () => void;
  onFlipRecord: () => void;
  onTogglePlay: () => void;
  onOpenGames: () => void;
  onOpenBooks: () => void;
  onVisitLaptop: () => void;
  /** The Bust was clicked. It is not a View: see ShelfModel. */
  onBust: () => void;
}

/** Half the carcass's width and a margin: what has to fit across a phone. */
const SHELF_HALF = (SHELF.innerWidth + SHELF.side * 2) / 2 + 0.14;

/**
 * What the camera needs to know about the window it is drawing into.
 *
 * `fit` is how far back the camera has to stand for something this many units
 * either side of where it is looking to fit across the frame. `wide` runs
 * from 0 on a phone held upright to 1 on anything landscape, for the things
 * that only make sense with room beside them.
 */
interface Frame {
  fit: (halfWidth: number) => number;
  wide: number;
}

/** How far forward a Box comes when it is held out for Inspecting. Matches Box.tsx. */
const INSPECT_FORWARD = 1.5;

interface Focus {
  x: number;
  y: number;
}

/**
 * The Desk, seen from its left-front corner.
 *
 * Composed by hand, which is what docs/adr/0004 means by a view: a position
 * and a target, authored and committed like any other content. From this
 * corner the lamp and the book stack fall to the left, the laptop sits near
 * the middle and the sheet of paper closes the right — and the desk lands
 * right-of-centre in frame, clear of the HUD text that runs down the left.
 *
 * Stood further back and looking less steeply down than it first did. From
 * close in and above, the window showed only ground: the horizon was just
 * over the top of the frame, and the Prairie is mostly sky. Fourteen degrees
 * down instead of twenty-two puts the horizon in the upper part of the window
 * and the chair in the foreground.
 */
const DESK_VIEW = {
  position: new THREE.Vector3(-2.6, 0.36, 2.05),
  lookAt: new THREE.Vector3(-1.72, -0.27, -0.2),
};

/**
 * The Console, seen from in front of the Shelf's right-hand end.
 *
 * From straight on, the floor lamp's stem stands between the camera and the
 * Console and cuts it in half. From here, left of the lamp, the stem falls
 * to the right of the Console, between it and the tall plant, and the two
 * paintings, the Record player and both bays are clear.
 */
const CONSOLE_VIEW = {
  position: new THREE.Vector3(0.9, -0.4, 1.65),
  lookAt: new THREE.Vector3(1.5, -0.68, -0.3),
};

/**
 * The Laptop, from straight in front of its screen (docs/adr/0007).
 *
 * Square on, along the lid's own normal, because Bones is drawn on the screen as
 * a page and a page read at an angle is a page that is harder to read. Aimed a
 * little below the middle of the screen, so it rides up clear of the HUD and a
 * strip of keyboard shows under it: still a laptop, not a screenshot of one.
 */
const LAPTOP_VIEW = {
  position: SCREEN_CENTRE.clone().addScaledVector(SCREEN_NORMAL, 0.4).addScaledVector(SCREEN_UP, -0.035),
  lookAt: SCREEN_CENTRE.clone().addScaledVector(SCREEN_UP, -0.035),
};

/** Pull a composed view back along its own line of sight until `half` fits the width. */
function composed(view: { position: THREE.Vector3; lookAt: THREE.Vector3 }, half: number, frame: Frame) {
  const back = view.position
    .clone()
    .sub(view.lookAt)
    .multiplyScalar(Math.max(1, frame.fit(half) / view.position.distanceTo(view.lookAt)));
  return { position: view.lookAt.clone().add(back), lookAt: view.lookAt.clone() };
}

/**
 * Where the camera wants to be. Browsing looks at the whole Shelf; Inspecting comes in close on the Box held out in front of it; the Desk
 * is a fixed frame that does not move with anything.
 */
function cameraTargets(
  state: ShelfState,
  place: ShelfPlace,
  focus: Focus | null,
  frame: Frame
) {
  // Pulled back along its own line of sight until the desk fits the width.
  if (place === 'desk') return composed(DESK_VIEW, 1.0, frame);
  if (place === 'console') return composed(CONSOLE_VIEW, 0.62, frame);
  if (place === 'laptop') {
    // On a phone Bones is a panel over the lower three quarters, so the camera
    // stands back far enough to see the Laptop on the Desk, small, and aims low
    // so it rides up into the strip between the nav and the panel.
    const view = composed(LAPTOP_VIEW, 0.19, frame);
    const narrow = 1 - frame.wide;
    if (narrow > 0) {
      const back = SCREEN_NORMAL.clone().multiplyScalar(1.5 * narrow);
      const lift = SCREEN_UP.clone().multiplyScalar(-0.56 * narrow);
      view.position.add(back).add(lift);
      view.lookAt.add(lift);
    }
    return view;
  }
  if (focus && (state === 'inspecting' || state === 'opened')) {
    // Aim to the left of the held Box so it sits in the right half of the
    // frame, clear of the HUD text running down the left. On a narrow window
    // the HUD is underneath instead and there is no left to keep clear, so
    // the Box comes back to the middle.
    const aside = 0.42 * frame.wide;
    const held = new THREE.Vector3(focus.x, focus.y + 0.12, INSPECT_FORWARD);
    const aim = new THREE.Vector3(held.x - aside, held.y + 0.04, held.z);
    return {
      position: new THREE.Vector3(
        aim.x,
        aim.y + 0.1,
        held.z + Math.max(2.45, frame.fit(BOX.width / 2 + 0.1 + aside))
      ),
      lookAt: aim,
    };
  }
  // Browsing: the whole Shelf, square on. It used to travel with the focused
  // Box, but a Box is now focused by pointing at it, and a camera that moves
  // when you point slides the Box out from under the pointer. Looking around
  // is the visitor's to do now, by dragging (see useOrbit).
  //
  // Four units back, so the room is most of the picture and not a margin
  // round the Shelf. On a phone, only as far back as the Shelf's width needs.
  //
  // On a phone the HUD is a block across the bottom, not a line down the
  // left, so the camera looks a little lower and the Shelf rides up clear of it.
  const under = -0.26 * (1 - frame.wide);
  // On a wide window it looks a little higher instead, and stands a third of
  // a unit further back. The Shelf with the Bust on top of it is taller than
  // the frame from four units, and the Bust was cut off at the shoulders. A
  // phone stands further back already and has it whole.
  const over = 0.13 * frame.wide;
  const back = 4.0 + 0.3 * frame.wide;
  return {
    position: new THREE.Vector3(0, 0.2 + under + over, Math.max(back, frame.fit(SHELF_HALF))),
    lookAt: new THREE.Vector3(0, under + over, 0),
  };
}

export function Scene({
  sections,
  focusedSlug,
  state,
  place,
  post,
  textureSize,
  phone,
  onFocus,
  onPreview,
  onInspect,
  onOpenPost,
  onHover,
  records,
  recordIndex,
  boardGames,
  onVisitConsole,
  onFlipRecord,
  onTogglePlay,
  onOpenGames,
  onOpenBooks,
  onVisitLaptop,
  onBust,
}: Props) {
  const p = palette();
  const camera = useThree((s) => s.camera);
  const canvas = useThree((s) => s.gl.domElement);
  // Not at the Laptop: there a drag is a game being played.
  const orbit = useOrbit(
    canvas,
    `${place}:${state}:${state === 'browsing' ? '' : focusedSlug}`,
    place !== 'laptop'
  );
  const seat = useRef(new THREE.Vector3());
  const aim = useRef(new THREE.Vector3());
  const size = useThree((s) => s.size);
  const lookAt = useRef(new THREE.Vector3(0, 0, 0));
  /** Where the camera would be with no lean on it. */
  const rail = useRef(new THREE.Vector3(0, 0, 4.4));

  // A phone held upright is far narrower than it is tall, so the same camera
  // distance that frames the Shelf on a desktop crops it on a phone. Each view
  // asks how far back it must stand for what it is showing to fit the width.
  const aspect = size.width / Math.max(1, size.height);
  const halfFov = THREE.MathUtils.degToRad((camera as THREE.PerspectiveCamera).fov ?? 42) / 2;
  const frame: Frame = {
    fit: (halfWidth) => halfWidth / (Math.tan(halfFov) * Math.max(0.3, aspect)),
    wide: THREE.MathUtils.smoothstep(aspect, 0.7, 1.25),
  };
  // How much further back than a desktop this window puts the Shelf camera.
  // The lean of the camera scales with it, so parallax looks the same.
  const pullBack = Math.max(1, frame.fit(SHELF_HALF) / 4.0);

  // Resolve the focused Box's resting place so the camera knows where to go.
  let focus: Focus | null = null;
  sections.forEach((section, si) => {
    section.projects.forEach((project, pi) => {
      if (project.slug === focusedSlug) {
        focus = {
          x: slotX(pi),
          y: sectionFloorY(si, sections.length) + BOX.height / 2,
        };
      }
    });
  });

  // Where the pointer is, -1 to 1 each way, and when it last moved. Tracked
  // on the window rather than the canvas: the HUD and the nav sit on top of
  // the canvas, and the room should not stop answering because the pointer is
  // over a button.
  const pointer = useRef({ x: 0, y: 0, movedAt: -Infinity });
  const lean = useRef(new THREE.Vector2());
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = (e.clientY / window.innerHeight) * 2 - 1;
      pointer.current.movedAt = roomTime();
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, []);

  const offset = useRef(new THREE.Vector3());
  const right = useRef(new THREE.Vector3());

  useFrame((_, delta) => {
    const ease = easeFor(delta, 0.0025);
    const { position, lookAt: target } = cameraTargets(state, place, focus, frame);

    // The camera leans a little towards the pointer, and with nothing to lean
    // towards it drifts on its own. It moves, the thing it looks at does not,
    // so near things slide against far ones: the Shelf against the wall, the
    // window frame against the prairie. That slide is the cheapest proof there
    // is that this is a room and not a picture of one.
    const t = roomTime();
    const idle = THREE.MathUtils.smoothstep(t - pointer.current.movedAt, 2.5, 6);
    const wantX = THREE.MathUtils.lerp(pointer.current.x, Math.sin(t * 0.21) * 0.55, idle);
    const wantY = THREE.MathUtils.lerp(pointer.current.y, Math.sin(t * 0.16 + 1.3) * 0.4, idle);
    const settle = isFrozen ? 1 : 1 - Math.pow(0.03, delta);
    lean.current.x += (wantX - lean.current.x) * settle;
    lean.current.y += (wantY - lean.current.y) * settle;

    // Less in the hand: a Book being read should hold still. None at all at the
    // Laptop: a game whose board swims under the pointer is a game you miss-click.
    const reach = place === 'laptop' ? 0 : (state === 'browsing' ? 0.2 : 0.07) * pullBack;
    right.current.set(1, 0, 0).applyQuaternion(camera.quaternion);
    offset.current
      .copy(right.current)
      .multiplyScalar(lean.current.x * reach)
      .addScaledVector(camera.up, -lean.current.y * reach * 0.55);

    // Ease the unleaned position, then lean from it, so the lean is never
    // fed back into the easing and the two cannot wind each other up.
    rail.current.lerp(position, ease);
    lookAt.current.lerp(target, ease);
    // Then swing the whole thing round what it is looking at, if the visitor
    // has dragged. The lean rides on top, so the room still breathes.
    aim.current.copy(lookAt.current);
    applyOrbit(seat.current.copy(rail.current), aim.current, orbit(delta));
    camera.position.copy(seat.current).add(offset.current);
    camera.lookAt(aim.current);
  });

  return (
    <>
      {/*
        All of this lights one thing: a Box in the hand. The carcass and the
        room draw with MeshBasicMaterial and ignore light entirely, because
        theirs is baked, and so is a Box's while it stands on the Shelf (see
        bakedLight.ts). These take over as a Box leaves its slot, and they are
        set to meet the bake rather than to look good alone: the canvas is not
        tone mapped, so what these produce goes to the screen as it is.

        An environment rather than bare lights: a Box sitting in a room is lit
        from every direction, and three directional lights cannot fake that.
        The panels mirror the Blender scene, so a real-time Box and the baked
        room read as one evening rather than two.

        They moved when the room did. docs/adr/0004 took the room to evening,
        and this is the half of that which is not baked: the key is now the
        lamp on the right, the fill is the dusk window behind on the left, and
        both are much weaker than daylight was. Left as they were, these put a
        daylit Box in a night room, which is the "second sun" fault from
        docs/adr/0003 wearing a different hat.
      */}
      <Environment resolution={128}>
        {/* The lamp, camera-right and a little forward of the Shelf, where
            scripts/shelf.py stands it. Warm, and by far the strongest: at this
            hour it is doing the work the window used to do. */}
        <Lightformer intensity={3.1} position={[2.6, 0.5, 1.5]} scale={[4, 4, 1]} color="#ffd9a2" />
        {/* The window, back-left and behind the Shelf. Cool, dim, and opposite
            the lamp — that opposition is what models a Box at night. */}
        <Lightformer intensity={0.85} position={[-2.4, 0.5, -1.8]} scale={[4, 4, 1]} color="#5d7fc4" />
        {/* What comes back off the floor. Very little; a dark floor at night
            returns almost nothing. */}
        <Lightformer
          intensity={0.22}
          position={[0.4, -2.2, 1.2]}
          rotation={[-Math.PI / 2, 0, 0]}
          scale={[6, 4, 1]}
          color="#e9c398"
        />
      </Environment>

      {/* Just enough direct light to throw a shadow; the environment does the
          shading. It comes from the lamp's side now, so a Box's shadow falls
          the same way as the carcass's does in the bake. Ambient is lower than
          daylight wanted and faintly blue, standing for the window. */}
      <ambientLight intensity={0.06} color="#9fb2d8" />
      <directionalLight
        position={[2.6, 1.0, 1.6]}
        intensity={0.75}
        color="#ffd9a6"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />

      <ShelfModel phone={phone} onBust={place === 'shelf' ? onBust : undefined} onHover={onHover} />

      {/* The view through the window, the glow of the lamps and the dust in
          it: the parts of the room that are drawn live. */}
      <Atmosphere />

      {/* The Laptop's screen: an editor, and at the Laptop View, Bones in it. */}
      <Laptop active={place === 'laptop'} phone={phone} onVisit={onVisitLaptop} onHover={onHover} />

      {/* Lettered at runtime rather than baked into the room, because a title
          baked into the room atlas is about twenty texels tall. */}
      <BookStack onOpen={onOpenBooks} onHover={onHover} />

      {/* A Claude sticker on the Pinboard. */}
      <Sticker />

      {/* The Console's live parts: the paintings over it, the record that is
          out of its sleeve row, and the names on the Board games. */}
      <Console
        records={records}
        recordIndex={recordIndex}
        boardGames={boardGames}
        active={place === 'console'}
        onVisit={onVisitConsole}
        onFlip={onFlipRecord}
        onTogglePlay={onTogglePlay}
        onOpenGames={onOpenGames}
        onHover={onHover}
      />

      {/* The latest Post, lying on the Desk. The one kind of content the Shelf
          cannot hold, finally somewhere. */}
      {post && (
        <Paper
          post={post}
          active={place === 'desk'}
          onOpen={onOpenPost}
          onHover={onHover}
        />
      )}

      {sections.map((section, si) => {
        const floorY = sectionFloorY(si, sections.length);
        return (
          <group key={section.theme}>
            <SectionLabel text={section.theme} y={floorY + SHELF.openingHeight - 0.075} />
            {section.projects.map((project, pi) => (
              <Box
                key={project.slug}
                project={project}
                position={[slotX(pi), floorY + BOX.height / 2, 0]}
                textureSize={textureSize}
                focused={project.slug === focusedSlug && state === 'browsing'}
                inspecting={
                  project.slug === focusedSlug &&
                  (state === 'inspecting' || state === 'opened')
                }
                opened={project.slug === focusedSlug && state === 'opened'}
                tile={boxTile(project.slug, si, pi)}
                onSelect={() =>
                  project.slug === focusedSlug ? onInspect(project.slug) : onFocus(project.slug)
                }
                onHover={onHover}
                onPreview={() => onPreview(project.slug)}
              />
            ))}
          </group>
        );
      })}

      {/* No contact shadow under the Shelf any more. It was a second render of
          the scene every frame to ground the Boxes, and the Boxes' shadows on
          the boards are in the bake now that they stand there while it bakes. */}

      {/* The room with the lamps off. Only ever seen for a frame, or past the
          open fourth side on a very wide window. */}
      <color attach="background" args={["#16171d"]} />
    </>
  );
}
