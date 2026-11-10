import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Scene } from './Scene';
import type { ShelfPlace, ShelfPost, ShelfProject, ShelfSection, ShelfState } from './types';

/**
 * The Shelf island.
 *
 * This is the only component on the site that ships JavaScript. Everything the
 * Shelf shows also exists as ordinary HTML underneath it, which is what the
 * crawlers, reduced-motion visitors and browsers without WebGL get instead.
 */

interface Props {
  sections: ShelfSection[];
  /** The latest Post, shown on the sheet of paper on the Desk. */
  post?: ShelfPost | null;
  /** Slug to open in Inspecting, when the visitor landed on /box/{slug}. */
  initialSlug?: string | null;
  /** Where the camera starts, when the visitor landed on /work or /writing. */
  initialPlace?: ShelfPlace;
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

/** Which place each URL is. The inverse of placeUrl below. */
function placeFor(pathname: string): ShelfPlace {
  return pathname === '/writing' ? 'desk' : 'shelf';
}

function placeUrl(place: ShelfPlace): string {
  return place === 'desk' ? '/writing' : '/work';
}

export default function Shelf({
  sections,
  post = null,
  initialSlug = null,
  initialPlace = 'shelf',
}: Props) {
  const ordered = useMemo(
    () => sections.flatMap((s) => s.projects),
    [sections]
  );

  const [state, setState] = useState<ShelfState>(initialSlug ? 'inspecting' : 'browsing');
  const [focusedSlug, setFocusedSlug] = useState<string | null>(
    initialSlug ?? ordered[0]?.slug ?? null
  );
  const [place, setPlace] = useState<ShelfPlace>(initialPlace);
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
    setPlace('shelf');
    pushUrl('/');
  }, [pushUrl]);

  /**
   * The navigation moves the camera instead of loading a page.
   *
   * The links keep real hrefs, so without JavaScript they are ordinary links
   * to ordinary pages, and both of those pages carry the room as an overlay —
   * so a reload lands back where it was. Every view is a URL, which is what
   * docs/adr/0001 asked of every other state. See docs/adr/0005.
   */
  const goTo = useCallback(
    (next: ShelfPlace) => {
      setPlace(next);
      setState('browsing');
      pushUrl(placeUrl(next));
    },
    [pushUrl]
  );

  /** The sheet of paper on the Desk hands over to the Post, as a Box does. */
  const openPost = useCallback((slug: string) => {
    window.location.href = `/${slug}`;
  }, []);

  const inspect = useCallback(
    (slug: string) => {
      setFocusedSlug(slug);
      setState('inspecting');
      setPlace('shelf');
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
      const path = window.location.pathname;
      const match = path.match(/^\/box\/([^/]+)$/);
      if (match) {
        setFocusedSlug(match[1]);
        setState('inspecting');
        setPlace('shelf');
      } else {
        setState('browsing');
        setPlace(placeFor(path));
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
        <Suspense fallback={null}>
          <Scene
            sections={sections}
            focusedSlug={focusedSlug}
            state={state}
            place={place}
            post={post}
            textureSize={phone ? 512 : 1024}
            onFocus={setFocusedSlug}
            onInspect={inspect}
            onOpenPost={openPost}
            onHover={setHovering}
          />
        </Suspense>
      </Canvas>

      {/* The Shelf hides the ordinary page chrome, so it carries its own way
          out. Real links, not hit targets in the canvas. */}
      <nav className="shelf-nav">
        <a className="shelf-brand" href="/work">
          <span className="shelf-brand-mark">*</span>
          <span className="shelf-brand-name">Evan Greenhough</span>
        </a>
        <div className="shelf-nav-links">
          {/* Real links, intercepted. Without JavaScript these are ordinary
              links to ordinary pages; with the room live they move the camera
              and push the same URL instead. Modified clicks fall through, so
              open-in-new-tab still does what it says. */}
          <a
            href="/work"
            aria-current={place === 'shelf' ? 'page' : undefined}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
              e.preventDefault();
              goTo('shelf');
            }}
          >
            Work
          </a>
          <a
            href="/writing"
            aria-current={place === 'desk' ? 'page' : undefined}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
              e.preventDefault();
              goTo('desk');
            }}
          >
            Writing
          </a>
        </div>
      </nav>

      {/* At the Desk the HUD belongs to the Post, not to whichever Box the
          Shelf happens to have focused. Same panel, different subject: the
          room has two places and the text under it has to say which one you
          are standing in. */}
      {place === 'desk' && post && (
        <div className="shelf-hud">
          <div className="shelf-hud-text">
            <div className="shelf-hud-eyebrow">{post.date}</div>
            <h2 className="shelf-hud-title">{post.title}</h2>
            <p className="shelf-hud-summary">{post.excerpt}</p>
          </div>
          <div className="shelf-hud-actions">
            <button className="shelf-btn" onClick={() => openPost(post.slug)}>
              Read it
            </button>
            <a className="shelf-btn ghost" href="/writing#posts">
              All writing
            </a>
          </div>
        </div>
      )}

      {place === 'shelf' && focused && (
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
