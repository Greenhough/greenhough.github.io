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
        The panels mirror the Blender scene — warm key where the window is,
        cool sky opposite, warm bounce up off the floor — so a real-time Box
        and the baked room read as one daylight instead of two.
      */}
      <Environment resolution={128}>
        <Lightformer intensity={2.6} position={[-3, 2, 3]} scale={[5, 5, 1]} color="#fff2dd" />
        <Lightformer intensity={0.7} position={[3, 1, 2]} scale={[4, 4, 1]} color="#aebfd8" />
        <Lightformer
          intensity={0.55}
          position={[0, -2.2, 1.5]}
          rotation={[-Math.PI / 2, 0, 0]}
          scale={[6, 4, 1]}
          color="#f6e2c8"
        />
      </Environment>

      {/* Just enough direct light to throw a shadow; the environment does the
          shading. Ambient stays low or the Boxes flatten out. */}
      <ambientLight intensity={0.12} />
      <directionalLight
        position={[-2.6, 1.6, 2.2]}
        intensity={0.9}
        color="#fff4e2"
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
        opacity={0.4}
        scale={6}
        blur={2.4}
        far={2}
      />

      <color attach="background" args={[p.paper]} />
    </>
  );
}
