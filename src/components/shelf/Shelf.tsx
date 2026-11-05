import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Scene } from './Scene';
import type { ShelfProject, ShelfSection, ShelfState } from './types';

/**
 * The Shelf island.
 *
 * This is the only component on the site that ships JavaScript. Everything the
 * Shelf shows also exists as ordinary HTML underneath it, which is what the
 * crawlers, reduced-motion visitors and browsers without WebGL get instead.
 */

interface Props {
  sections: ShelfSection[];
  /** Slug to open in Inspecting, when the visitor landed on /box/{slug}. */
  initialSlug?: string | null;
}

/** Matches the failsafe in the inline script in index.astro. */
const LIVE_CLASS = 'shelf-live';

function isPhone() {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches;
}

export default function Shelf({ sections, initialSlug = null }: Props) {
  const ordered = useMemo(
    () => sections.flatMap((s) => s.projects),
    [sections]
  );

  const [state, setState] = useState<ShelfState>(initialSlug ? 'inspecting' : 'power-on');
  const [focusedSlug, setFocusedSlug] = useState<string | null>(
    initialSlug ?? ordered[0]?.slug ?? null
  );
  const [hovering, setHovering] = useState(false);
  const phone = useRef(false);

  useEffect(() => {
    phone.current = isPhone();
    document.documentElement.classList.add(LIVE_CLASS);
    return () => document.documentElement.classList.remove(LIVE_CLASS);
  }, []);

  const focused: ShelfProject | null =
    ordered.find((p) => p.slug === focusedSlug) ?? null;

  /** Every state is a URL: / is Browsing, /box/{slug} is Inspecting. */
  const pushUrl = useCallback((url: string) => {
    if (window.location.pathname !== url) window.history.pushState({}, '', url);
  }, []);

  const browse = useCallback(() => {
    setState('browsing');
    pushUrl('/');
  }, [pushUrl]);

  const inspect = useCallback(
    (slug: string) => {
      setFocusedSlug(slug);
      setState('inspecting');
      pushUrl(`/box/${slug}`);
    },
    [pushUrl]
  );

  const open = useCallback(() => {
    if (!focused) return;
    setState('opened');
    // Let the lid finish lifting, then hand over to the Write-up.
    window.setTimeout(() => {
      window.location.href = `/${focused.slug}`;
    }, 650);
  }, [focused]);

  // Back and forward move between Browsing and Inspecting without tearing the
  // scene down. A 3D page that swallows the back button feels broken.
  useEffect(() => {
    const onPop = () => {
      const match = window.location.pathname.match(/^\/box\/([^/]+)$/);
      if (match) {
        setFocusedSlug(match[1]);
        setState('inspecting');
      } else {
        setState((s) => (s === 'power-on' ? s : 'browsing'));
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Keyboard: the Shelf is navigable without a mouse.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (state === 'power-on') {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          browse();
        }
        return;
      }

      const i = ordered.findIndex((p) => p.slug === focusedSlug);

      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedSlug(ordered[Math.min(ordered.length - 1, i + 1)]?.slug ?? focusedSlug);
        if (state !== 'browsing') browse();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedSlug(ordered[Math.max(0, i - 1)]?.slug ?? focusedSlug);
        if (state !== 'browsing') browse();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (state === 'browsing' && focusedSlug) inspect(focusedSlug);
        else if (state === 'inspecting') open();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        if (state === 'inspecting') {
          browse();
          window.history.back();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state, ordered, focusedSlug, browse, inspect, open]);

  const lit = state !== 'power-on';

  return (
    <div className="shelf" data-state={state}>
      <Canvas
        className="shelf-canvas"
        shadows
        // Measure immediately rather than on a debounce, so the first frame is
        // not missed when the island mounts into a container still settling.
        resize={{ debounce: 0, scroll: false }}
        dpr={[1, phone.current ? 1.5 : 2]}
        camera={{ position: [0, 0, 4.4], fov: 42 }}
        style={{ cursor: hovering && lit ? 'pointer' : 'default' }}
      >
        <Scene
          sections={sections}
          focusedSlug={focusedSlug}
          state={state}
          textureSize={phone.current ? 512 : 1024}
          onFocus={setFocusedSlug}
          onInspect={inspect}
          onHover={setHovering}
        />
      </Canvas>

      {/* The controls are real HTML, so the Shelf is usable by keyboard and
          readable by a screen reader without anything being re-implemented. */}
      {!lit && (
        <div className="shelf-power">
          <p className="shelf-power-line">Five things I built. On a shelf.</p>
          <button className="shelf-power-btn" onClick={browse} autoFocus>
            Power on
          </button>
          <a className="shelf-skip" href="/work">
            or read them as a list
          </a>
        </div>
      )}

      {lit && focused && (
        <div className="shelf-hud">
          <div className="shelf-hud-text">
            <div className="shelf-hud-eyebrow">{focused.eyebrow}</div>
            <h2 className="shelf-hud-title">{focused.title}</h2>
            <p className="shelf-hud-summary">{focused.summary}</p>
          </div>
          <div className="shelf-hud-actions">
            {state === 'browsing' ? (
              <button className="shelf-btn" onClick={() => inspect(focused.slug)}>
                Take it off the shelf
              </button>
            ) : (
              <>
                <button className="shelf-btn" onClick={open}>
                  Open it
                </button>
                <button className="shelf-btn ghost" onClick={browse}>
                  Put it back
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
