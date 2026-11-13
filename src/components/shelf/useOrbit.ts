import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { easeFor } from './clock';

/**
 * Looking around the room by hand.
 *
 * Every view is still authored (docs/adr/0004): this only moves the camera
 * off it, and only so far. Drag sideways to walk along the room, turning a
 * little back towards where the view was looking; drag up and down to look
 * over or under; pinch or scroll to come closer or stand back. Walking rather
 * than orbiting because on a phone the Shelf fills the width, and swinging
 * round it only showed the Shelf from an angle, never the Console beside it. A new view starts square on again,
 * so a visitor can never get lost: the nav always brings back a composed frame.
 *
 * The limits keep the camera inside the room. Past about forty degrees either
 * way it starts to see round the walls that were never built.
 */
/** How far either way along the room, in metres: the Desk one end, the Console the other. */
const WALK = 1.7;
/** Radians turned back towards the view's centre per metre walked. */
const TURN_BACK = 0.12;
const PITCH_UP = THREE.MathUtils.degToRad(14);
const PITCH_DOWN = THREE.MathUtils.degToRad(10);
const ZOOM_IN = 0.55;
const ZOOM_OUT = 1.25;
/** Radians per pixel dragged, scaled by the window so a phone turns as far as a desktop. */
const TURN = 2.2;
/** Metres per pixel dragged, over the window's width. */
const STRIDE = 3.4;
/** Pixels a press can wander and still be a click. */
const SLOP = 6;

export interface Orbit {
  /** Metres along the room, right positive. */
  walk: number;
  pitch: number;
  /** Multiplies the distance from the camera to what it looks at. */
  zoom: number;
}

export function useOrbit(element: HTMLElement, resetKey: string, enabled: boolean) {
  const want = useRef<Orbit>({ walk: 0, pitch: 0, zoom: 1 });
  const now = useRef<Orbit>({ walk: 0, pitch: 0, zoom: 1 });

  // A different place, or a Box taken down, is a fresh composed view.
  useEffect(() => {
    want.current = { walk: 0, pitch: 0, zoom: 1 };
  }, [resetKey]);

  useEffect(() => {
    if (!enabled) {
      want.current = { walk: 0, pitch: 0, zoom: 1 };
      return;
    }

    const pointers = new Map<number, { x: number; y: number }>();
    let start = { x: 0, y: 0 };
    let dragged = false;
    let pinchFrom = 0;
    let zoomFrom = 1;

    const clampZoom = (z: number) => THREE.MathUtils.clamp(z, ZOOM_IN, ZOOM_OUT);
    const spread = () => {
      const [a, b] = [...pointers.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };

    const onDown = (e: PointerEvent) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        start = { x: e.clientX, y: e.clientY };
        dragged = false;
      } else if (pointers.size === 2) {
        pinchFrom = spread();
        zoomFrom = want.current.zoom;
        dragged = true;
      }
    };

    const onMove = (e: PointerEvent) => {
      const last = pointers.get(e.pointerId);
      if (!last) return;
      const dx = e.clientX - last.x;
      const dy = e.clientY - last.y;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointers.size >= 2) {
        if (pinchFrom > 0) want.current.zoom = clampZoom(zoomFrom * (pinchFrom / spread()));
        return;
      }
      if (!dragged && Math.hypot(e.clientX - start.x, e.clientY - start.y) < SLOP) return;
      dragged = true;
      const across = Math.max(320, Math.min(window.innerWidth, 1400));
      const per = TURN / across;
      // Drag the room, not the camera: pulling left brings the right into view.
      want.current.walk = THREE.MathUtils.clamp(want.current.walk - (dx * STRIDE) / across, -WALK, WALK);
      want.current.pitch = THREE.MathUtils.clamp(want.current.pitch + dy * per, -PITCH_DOWN, PITCH_UP);
    };

    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinchFrom = 0;
    };

    // react-three-fiber fires onClick however far the pointer moved between
    // press and release, so a drag that ends over a Box would take it down.
    // Caught here, on the way in, before the canvas sees it.
    const onClick = (e: MouseEvent) => {
      if (!dragged) return;
      dragged = false;
      e.stopPropagation();
      e.preventDefault();
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      want.current.zoom = clampZoom(want.current.zoom * Math.exp(e.deltaY * 0.0015));
    };

    const onDouble = () => {
      want.current = { walk: 0, pitch: 0, zoom: 1 };
    };

    element.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    element.addEventListener('click', onClick, { capture: true });
    element.addEventListener('wheel', onWheel, { passive: false });
    element.addEventListener('dblclick', onDouble);
    return () => {
      element.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      element.removeEventListener('click', onClick, { capture: true });
      element.removeEventListener('wheel', onWheel);
      element.removeEventListener('dblclick', onDouble);
    };
  }, [element, enabled]);

  /** Ease towards where the hand left it. Call once a frame. */
  const step = (delta: number): Orbit => {
    const k = easeFor(delta, 0.002);
    const n = now.current;
    n.walk += (want.current.walk - n.walk) * k;
    n.pitch += (want.current.pitch - n.pitch) * k;
    n.zoom += (want.current.zoom - n.zoom) * k;
    return n;
  };

  return step;
}

const AXIS_Y = new THREE.Vector3(0, 1, 0);
const side = new THREE.Vector3();

const along = new THREE.Vector3();

/** Move `position` and `target` by the orbit, both in place. */
export function applyOrbit(position: THREE.Vector3, target: THREE.Vector3, orbit: Orbit) {
  const arm = position.sub(target);
  // Along the room is across the view, kept level.
  along.crossVectors(AXIS_Y, arm).setY(0).normalize();
  target.addScaledVector(along, orbit.walk);
  arm.applyAxisAngle(AXIS_Y, orbit.walk * TURN_BACK);
  side.crossVectors(AXIS_Y, arm).normalize();
  if (side.lengthSq() > 0) arm.applyAxisAngle(side, -orbit.pitch);
  arm.multiplyScalar(orbit.zoom);
  return arm.add(target);
}
