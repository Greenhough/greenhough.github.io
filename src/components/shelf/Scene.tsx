import { useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, Environment, Lightformer } from '@react-three/drei';
import { Box, BOX } from './Box';
import { SHELF, SectionLabel, sectionFloorY, slotX } from './ShelfUnit';
import { ShelfModel } from './ShelfModel';
import { palette } from './palette';
import type { ShelfSection, ShelfState } from './types';

interface Props {
  sections: ShelfSection[];
  focusedSlug: string | null;
  state: ShelfState;
  textureSize: number;
  onFocus: (slug: string) => void;
  onInspect: (slug: string) => void;
  onHover: (hovering: boolean) => void;
}

/** How far forward a Box comes when it is held out for Inspecting. Matches Box.tsx. */
const INSPECT_FORWARD = 1.5;

interface Focus {
  x: number;
  y: number;
}

/**
 * Where the camera wants to be. Browsing travels the Shelf with the focused
 * Box; Inspecting comes in close on the Box held out in front of it.
 */
function cameraTargets(state: ShelfState, focus: Focus | null, pullBack: number) {
  if (!focus) {
    return {
      position: new THREE.Vector3(0, 0, 4.4 * pullBack),
      lookAt: new THREE.Vector3(0, 0, 0),
    };
  }
  if (state === 'inspecting' || state === 'opened') {
    // Aim to the left of the held Box so it sits in the right half of the
    // frame, clear of the HUD text running down the left.
    const held = new THREE.Vector3(focus.x, focus.y + 0.12, INSPECT_FORWARD);
    const aim = new THREE.Vector3(held.x - 0.42, held.y + 0.04, held.z);
    return {
      position: new THREE.Vector3(aim.x, aim.y + 0.1, held.z + 2.45 * pullBack),
      lookAt: aim,
    };
  }
  // Browsing: travel with the focused Box, but damped, so the whole Shelf stays
  // in frame and the camera drifts rather than swinging. Biased upward to keep
  // the Shelf clear of the HUD along the bottom edge.
  const driftX = focus.x * 0.55;
  return {
    position: new THREE.Vector3(driftX, focus.y * 0.45 + 0.3, 3.5 * pullBack),
    lookAt: new THREE.Vector3(driftX, focus.y * 0.45 - 0.05, 0),
  };
}

export function Scene({
  sections,
  focusedSlug,
  state,
  textureSize,
  onFocus,
  onInspect,
  onHover,
}: Props) {
  const p = palette();
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const lookAt = useRef(new THREE.Vector3(0, 0, 0));

  // A phone held upright is far narrower than it is tall, so the same camera
  // distance that frames the Shelf on a desktop crops it on a phone. Pull back
  // by however much the viewport is narrower than 4:3.
  const aspect = size.width / Math.max(1, size.height);
  const pullBack = Math.min(2.2, Math.max(1, 1.333 / Math.max(0.3, aspect)));

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

  useFrame((_, delta) => {
    const ease = 1 - Math.pow(0.0025, delta);
    const { position, lookAt: target } = cameraTargets(state, focus, pullBack);
    camera.position.lerp(position, ease);
    lookAt.current.lerp(target, ease);
    camera.lookAt(lookAt.current);
  });

  return (
    <>
      {/*
        All of this lights the Boxes only. The carcass and the room draw with
        MeshBasicMaterial and ignore light entirely, because theirs is baked.

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

      <ShelfModel />

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
                onSelect={() =>
                  project.slug === focusedSlug ? onInspect(project.slug) : onFocus(project.slug)
                }
                onHover={onHover}
              />
            ))}
          </group>
        );
      })}

      <ContactShadows
        position={[0, -(sections.length * (SHELF.openingHeight + SHELF.plank)) / 2 - 0.02, 0]}
        opacity={0.28}
        scale={6}
        blur={2.4}
        far={2}
      />

      <color attach="background" args={[p.paper]} />
    </>
  );
}
