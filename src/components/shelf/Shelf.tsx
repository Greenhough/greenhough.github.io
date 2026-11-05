import { useCallback, useEffect, useMemo, useState } from 'react';
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

// These are passed to <Canvas> and must keep their identity between renders.
// Fresh object literals make react-three-fiber reconfigure the renderer on
// every render, which showed up as the scene initialising twice and a Box page
// coming up blank.
const RESIZE = { debounce: 0, scroll: false } as const;
const CAMERA = { position: [0, 0, 4.4] as [number, number, number], fov: 42 };

function isPhone() {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches;
}

export default function Shelf({ sections, initialSlug = null }: Props) {
  const ordered = useMemo(
    () => sections.flatMap((s) => s.projects),
    [sections]
  );

  const [state, setState] = useState<ShelfState>(initialSlug ? 'inspecting' : 'browsing');
  const [focusedSlug, setFocusedSlug] = useState<string | null>(
    initialSlug ?? ordered[0]?.slug ?? null
  );
  const [hovering, setHovering] = useState(false);
  // Read once, at mount. This island is client:only, so there is no server
  // render to disagree with.
  const [phone] = useState(() => isPhone());
  const dpr = useMemo<[number, number]>(() => [1, phone ? 1.5 : 2], [phone]);

  useEffect(() => {
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
        setState('browsing');
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Keyboard: the Shelf is navigable without a mouse.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;

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

  return (
    <div className="shelf" data-state={state} data-hovering={hovering ? 'true' : undefined}>
      <Canvas
        className="shelf-canvas"
        shadows
        // Measure immediately rather than on a debounce, so the first frame is
        // not missed when the island mounts into a container still settling.
        resize={RESIZE}
        dpr={dpr}
        camera={CAMERA}
      >
        <Scene
          sections={sections}
          focusedSlug={focusedSlug}
          state={state}
          textureSize={phone ? 512 : 1024}
          onFocus={setFocusedSlug}
          onInspect={inspect}
          onHover={setHovering}
        />
      </Canvas>

      {/* The Shelf hides the ordinary page chrome, so it carries its own way
          out. Real links, not hit targets in the canvas. */}
      <nav className="shelf-nav">
        <a className="shelf-brand" href="/work">
          <span className="shelf-brand-mark">*</span>
          <span className="shelf-brand-name">Evan Greenhough</span>
        </a>
        <div className="shelf-nav-links">
          <a href="/work">Work</a>
          <a href="/writing">Writing</a>
        </div>
      </nav>

      {focused && (
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
