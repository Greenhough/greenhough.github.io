import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Scene } from './Scene';
import { turntable } from './clock';
import Bones from '../bones/Bones';
import type {
  ShelfBoardGame,
  ShelfPlace,
  ShelfPost,
  ShelfProject,
  ShelfRecord,
  ShelfSection,
  ShelfState,
} from './types';

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
  /** The records in the Console, in the order they are flipped through. */
  records?: ShelfRecord[];
  /** The Board games stacked in the Console, top first. */
  boardGames?: ShelfBoardGame[];
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
  if (pathname === '/writing') return 'desk';
  if (pathname === '/music') return 'console';
  if (pathname === '/play') return 'laptop';
  return 'shelf';
}

function placeUrl(place: ShelfPlace): string {
  if (place === 'desk') return '/writing';
  if (place === 'console') return '/music';
  if (place === 'laptop') return '/play';
  return '/work';
}

// Stable when a page passes none, for the same reason as RESIZE and CAMERA.
const NO_RECORDS: ShelfRecord[] = [];
const NO_GAMES: ShelfBoardGame[] = [];

export default function Shelf({
  sections,
  post = null,
  records = NO_RECORDS,
  boardGames = NO_GAMES,
  initialSlug = null,
  initialPlace = 'shelf',
}: Props) {
  const ordered = useMemo(
    () => sections.flatMap((s) => s.projects),
    [sections]
  );

  const [state, setState] = useState<ShelfState>(initialSlug ? 'inspecting' : 'browsing');
  // Nothing is picked until the visitor picks it. Landing with the first Box
  // already slid out made the room read as a page about that one project.
  const [focusedSlug, setFocusedSlug] = useState<string | null>(initialSlug);
  const [place, setPlace] = useState<ShelfPlace>(initialPlace);
  const [hovering, setHovering] = useState(false);
  // Which record is out of the row, and whether it is on the player. Nothing
  // is asked of YouTube until a record is put on: see docs/adr/0005.
  const [recordIndex, setRecordIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const record = records[recordIndex] ?? null;
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

  const flipRecord = useCallback(
    (by = 1) => {
      if (records.length === 0) return;
      setRecordIndex((i) => (i + by + records.length) % records.length);
    },
    [records.length]
  );
  const togglePlay = useCallback(() => setPlaying((on) => !on), []);
  const visitConsole = useCallback(() => goTo('console'), [goTo]);
  const visitLaptop = useCallback(() => goTo('laptop'), [goTo]);
  const openGames = useCallback(() => {
    window.location.href = '/board-games';
  }, []);
  const openBooks = useCallback(() => {
    window.location.href = '/books';
  }, []);

  // The record turns for as long as a song is on, wherever the camera is.
  useEffect(() => {
    turntable.playing = playing;
    return () => {
      turntable.playing = false;
    };
  }, [playing]);

  /** The sheet of paper on the Desk hands over to the Post, as a Box does. */
  const openPost = useCallback((slug: string) => {
    window.location.href = `/${slug}`;
  }, []);

  /** A mouse over a Box while Browsing slides it out and names it in the HUD. */
  const preview = useCallback(
    (slug: string) => {
      if (state === 'browsing' && place === 'shelf') setFocusedSlug(slug);
    },
    [state, place]
  );

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

      // At the Laptop the keys belong to Bones (1, 2 and 3), except the way out.
      if (place === 'laptop') {
        if (e.key === 'Escape') {
          e.preventDefault();
          goTo('desk');
        }
        return;
      }

      // At the Console the arrows flip through the records, not the Boxes.
      if (place === 'console') {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          flipRecord(1);
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          flipRecord(-1);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          togglePlay();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          goTo('shelf');
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
  }, [state, place, ordered, focusedSlug, browse, inspect, open, flipRecord, togglePlay, goTo]);

  return (
    <div className="shelf" data-state={state} data-hovering={hovering ? 'true' : undefined}>
      <Canvas
        className="shelf-canvas"
        shadows
        // No tone mapping. Almost everything on screen is baked, and a bake
        // left Blender already mapped to a display; mapping the canvas again
        // was only ever right for the Books, and a Book at rest is now baked
        // light too. With the canvas flat, printing times baked light comes
        // out exactly as Cycles rendered it, and the live lights in Scene.tsx
        // are set to meet it. See docs/adr/0006.
        flat
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
            phone={phone}
            onFocus={setFocusedSlug}
            onPreview={preview}
            onInspect={inspect}
            onOpenPost={openPost}
            onHover={setHovering}
            records={records}
            recordIndex={recordIndex}
            boardGames={boardGames}
            onVisitConsole={visitConsole}
            onFlipRecord={flipRecord}
            onTogglePlay={togglePlay}
            onOpenGames={openGames}
            onOpenBooks={openBooks}
            onVisitLaptop={visitLaptop}
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
            <a
              className="shelf-btn ghost"
              href="/play"
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                e.preventDefault();
                goTo('laptop');
              }}
            >
              Play Bones
            </a>
          </div>
        </div>
      )}

      {/* At the Laptop the game is on the screen, and the HUD only says what it
          is, whose rules they are, and the way back to the Desk. On a phone the
          screen is too small to play on, so the game itself comes up here. */}
      {place === 'laptop' && (
        <div className={phone ? 'shelf-hud shelf-hud-play' : 'shelf-hud'}>
          {phone ? (
            <div className="shelf-play">
              <Bones />
            </div>
          ) : (
            <div className="shelf-hud-text">
              <div className="shelf-hud-eyebrow">On the laptop</div>
              <h2 className="shelf-hud-title">Bones</h2>
              <p className="shelf-hud-summary">
                Knucklebones from <em>Cult of the Lamb</em>, against the computer. Click a column
                or press 1, 2 or 3. Matching dice multiply and knock out the other side's.
              </p>
            </div>
          )}
          <div className="shelf-hud-actions">
            <button className="shelf-btn ghost" onClick={() => goTo('desk')}>
              Back to the desk
            </button>
          </div>
        </div>
      )}

      {/* At the Console the HUD belongs to the record that is out of the row.
          The player is YouTube's own, asked for only once a record is put on,
          and it stays on screen while it plays wherever the camera goes. */}
      {playing && record && (
        <iframe
          className="shelf-player"
          key={record.youtube}
          src={`https://www.youtube-nocookie.com/embed/${record.youtube}?autoplay=1&rel=0`}
          title={`${record.song} by ${record.artist}`}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
        />
      )}
      {place === 'console' && record && (
        <div className="shelf-hud">
          <div className="shelf-hud-text">
            <div className="shelf-hud-eyebrow">
              {record.artist} &middot; {recordIndex + 1} of {records.length}
            </div>
            <h2 className="shelf-hud-title">{record.song}</h2>
            <p className="shelf-hud-summary">
              {record.album ? `From ${record.album}.` : 'A single.'} Flip through the sleeves, then put
              one on.
            </p>
          </div>
          <div className="shelf-hud-actions">
            <button className="shelf-btn" onClick={togglePlay}>
              {playing ? 'Take it off' : 'Put it on'}
            </button>
            <button className="shelf-btn ghost" onClick={() => flipRecord(1)}>
              Next record
            </button>
            {boardGames.length > 0 && (
              <a className="shelf-btn ghost" href="/board-games">
                Board games
              </a>
            )}
          </div>
        </div>
      )}

      {place === 'shelf' && !focused && (
        <div className="shelf-hud">
          <div className="shelf-hud-text">
            <div className="shelf-hud-eyebrow">Work</div>
            <h2 className="shelf-hud-title">Pick something off the shelf</h2>
            <p className="shelf-hud-summary">
              {phone
                ? 'Tap a box to see what it is. Drag to look around the room, pinch to get closer.'
                : 'Point at a box to see what it is, click to take it down. Drag to look around the room, scroll to get closer.'}
            </p>
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
