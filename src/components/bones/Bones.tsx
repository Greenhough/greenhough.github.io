import { useEffect, useRef, useState } from 'react';
import {
  chooseColumn,
  columnScore,
  COLUMNS,
  hasRoom,
  newGame,
  place,
  roll,
  scores,
  type Column,
  type ColumnIndex,
  type Face,
  type Game,
  type Player,
} from '../../lib/bones';
import './bones.css';

/**
 * Bones, drawn as a program running in the Laptop's editor (docs/adr/0007).
 *
 * The same component is meant for `/play` and, later, the Laptop's screen, so it
 * owns nothing about the page around it. The rules live in src/lib/bones.ts; this
 * only paces the computer's turns. Beside the table sits a short rules pane, so a
 * visitor can learn the game while playing it.
 */

/** Where each face's pips sit in a three-by-three grid, read left to right, top down. */
const PIPS: Record<Face, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

/** How long the computer takes over each half of its turn, and the visitor's roll. */
const PACE = { visitorRoll: 380, computerRoll: 520, computerPlace: 760 };
const QUICK = { visitorRoll: 120, computerRoll: 160, computerPlace: 220 };

const TALLY_KEY = 'bones.tally';
interface Tally {
  won: number;
  lost: number;
  drawn: number;
}

function readTally(): Tally {
  try {
    const raw = localStorage.getItem(TALLY_KEY);
    if (raw) return { won: 0, lost: 0, drawn: 0, ...JSON.parse(raw) };
  } catch {
    // Private windows and blocked storage: the tally just starts at nothing.
  }
  return { won: 0, lost: 0, drawn: 0 };
}

function writeTally(tally: Tally) {
  try {
    localStorage.setItem(TALLY_KEY, JSON.stringify(tally));
  } catch {
    // Allowed to vanish (docs/adr/0007).
  }
}

/** A note when a die just put down knocked dice off the other board, or null. */
function knockout(before: Game, after: Game, at: ColumnIndex): string | null {
  const me = before.turn;
  const them: Player = me === 0 ? 1 : 0;
  const face = before.roll!;
  const knocked = before.boards[them][at].length - after.boards[them][at].length;
  if (knocked === 0) return null;
  const whose = me === 0 ? "the cpu's" : 'your';
  const what = knocked === 1 ? `${whose} ${face}` : `${knocked} of ${whose} ${face}s`;
  return `${me === 0 ? 'You' : 'CPU'} knocked out ${what}`;
}

/** The rules, short enough to sit beside the table. Full version on /play. */
function Rules() {
  return (
    <aside className="bones-rules" aria-label="How to play">
      <div className="bones-rules-head">// how to play</div>
      <ol>
        <li>Roll one die. Put it in any of your columns with room.</li>
        <li>
          Matching dice in a column multiply. Two 4s score (4+4)&times;2 = <b>16</b>. Three 4s score{' '}
          <b>36</b>.
        </li>
        <li>
          Your die knocks out every die of the same number in the cpu's column across from it.
        </li>
        <li>When either board fills, the game ends. Higher score wins.</li>
      </ol>
      <div className="bones-rules-keys">click a column or press 1, 2, 3</div>
      <div className="bones-rules-credit">
        Knucklebones, from <em>Cult of the Lamb</em>
      </div>
    </aside>
  );
}

function Die({ face, count, rolling }: { face: Face; count?: number; rolling?: boolean }) {
  const tone = count === 3 ? ' triple' : count === 2 ? ' pair' : '';
  return (
    <span className={`bones-die${tone}${rolling ? ' rolling' : ''}`} aria-hidden="true">
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className={PIPS[face].includes(i) ? 'pip on' : 'pip'} />
      ))}
    </span>
  );
}

function ColumnDice({ column }: { column: Column }) {
  const counts = new Map<Face, number>();
  for (const f of column) counts.set(f, (counts.get(f) ?? 0) + 1);
  return (
    <>
      {[0, 1, 2].map((slot) => {
        const face = column[slot];
        return (
          <span key={slot} className="bones-slot">
            {face ? <Die face={face} count={counts.get(face)} /> : null}
          </span>
        );
      })}
    </>
  );
}

function label(column: Column, n: number): string {
  const dice = column.length ? column.join(', ') : 'empty';
  return `Column ${n}: ${dice}. Scores ${columnScore(column)}.`;
}

interface Props {
  /**
   * 'page' sets the rules beside the table when there is room and under it when
   * there is not, for `/play` and a phone. 'screen' is laid out at exactly the
   * Laptop screen's 600 by 387 pixels, rules down the side.
   */
  variant?: 'page' | 'screen';
}

export default function Bones({ variant = 'page' }: Props) {
  const [game, setGame] = useState<Game>(() => newGame(0));
  const [note, setNote] = useState<string | null>(null);
  const [tally, setTally] = useState<Tally>({ won: 0, lost: 0, drawn: 0 });
  const [rolledAt, setRolledAt] = useState(0);
  const quick = useRef(false);
  const nextFirst = useRef<Player>(1);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTally(readTally());
    quick.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  // The pace of the game: the visitor's die rolls itself, the computer rolls and
  // then places. Each step waits a moment so a person can follow it.
  useEffect(() => {
    if (game.outcome !== null) return;
    const pace = quick.current ? QUICK : PACE;
    let wait: number;
    let step: () => void;

    if (game.roll === null) {
      wait = game.turn === 0 ? pace.visitorRoll : pace.computerRoll;
      step = () => {
        setGame((g) => roll(g, Math.random));
        setRolledAt(Date.now());
      };
    } else if (game.turn === 1) {
      wait = pace.computerPlace;
      step = () => {
        const at = chooseColumn(game, Math.random);
        const after = place(game, at);
        setNote(knockout(game, after, at));
        setGame(after);
      };
    } else {
      return;
    }
    const timer = window.setTimeout(step, wait);
    return () => window.clearTimeout(timer);
  }, [game]);

  // The end: the tally kept.
  useEffect(() => {
    if (game.outcome === null) return;
    setTally((t) => {
      const next = {
        won: t.won + (game.outcome === 0 ? 1 : 0),
        lost: t.lost + (game.outcome === 1 ? 1 : 0),
        drawn: t.drawn + (game.outcome === 'draw' ? 1 : 0),
      };
      writeTally(next);
      return next;
    });
  }, [game.outcome]);

  const visitorCanPlace = game.outcome === null && game.turn === 0 && game.roll !== null;

  const put = (at: ColumnIndex) => {
    if (!visitorCanPlace || !hasRoom(game.boards[0][at])) return;
    const after = place(game, at);
    setNote(knockout(game, after, at));
    setGame(after);
  };

  // 1, 2 and 3 put the die down, for anyone playing from the keyboard. Only
  // while this board is on screen: on /play with the Room up, the page's own
  // board is still mounted underneath it, hidden, and must not play along.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (!root.current || root.current.getClientRects().length === 0) return;
      const n = Number(e.key);
      if (n >= 1 && n <= 3) put((n - 1) as ColumnIndex);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const again = () => {
    const first = nextFirst.current;
    nextFirst.current = first === 0 ? 1 : 0;
    setGame(newGame(first));
    setNote(null);
  };

  const [mine, theirs] = scores(game);
  const status =
    game.outcome !== null
      ? game.outcome === 'draw'
        ? `Draw, ${mine} all`
        : game.outcome === 0
          ? `You win, ${mine} to ${theirs}`
          : `CPU wins, ${theirs} to ${mine}`
      : game.turn === 0
        ? game.roll === null
          ? 'Rolling…'
          : 'Your move: pick a column'
        : 'CPU is thinking…';

  return (
    <div className={`bones ${variant}`} data-turn={game.turn} ref={root}>
      <div className="bones-bar">
        <span className="bones-lights" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="bones-tab">bones.ts</span>
        <span className="bones-tally" title="Kept in this browser only">
          {tally.won}W {tally.lost}L{tally.drawn ? ` ${tally.drawn}D` : ''}
        </span>
      </div>

      <div className="bones-body">
        <div className="bones-table">
          <section className="bones-side cpu" aria-label={`CPU, ${theirs} points`}>
            <div className="bones-who">
              <span>cpu</span>
              <b>{theirs}</b>
            </div>
            <div className="bones-board">
              {COLUMNS.map((at) => (
                <div key={at} className="bones-col" aria-label={label(game.boards[1][at], at + 1)}>
                  <span className="bones-colscore">{columnScore(game.boards[1][at])}</span>
                  <span className="bones-stack">
                    <ColumnDice column={game.boards[1][at]} />
                  </span>
                </div>
              ))}
            </div>
            <div className="bones-hand">
              {game.turn === 1 && game.roll !== null && game.outcome === null ? (
                <Die face={game.roll} rolling key={rolledAt} />
              ) : null}
            </div>
          </section>

          <div className="bones-status" role="status" aria-live="polite">
            {status}
            {game.outcome === null && game.turn === 0 && game.roll !== null ? `: ${game.roll}` : ''}
            {note ? <span className="bones-note">{note}</span> : null}
            {game.outcome !== null ? (
              <button type="button" className="bones-again" onClick={again}>
                play again
              </button>
            ) : null}
          </div>

          <section className="bones-side you" aria-label={`You, ${mine} points`}>
            <div className="bones-hand">
              {game.turn === 0 && game.roll !== null && game.outcome === null ? (
                <Die face={game.roll} rolling key={rolledAt} />
              ) : null}
            </div>
            <div className="bones-board">
              {COLUMNS.map((at) => {
                const column = game.boards[0][at];
                return (
                  <button
                    key={at}
                    type="button"
                    className="bones-col"
                    disabled={!visitorCanPlace || !hasRoom(column)}
                    onClick={() => put(at)}
                    aria-label={`${label(column, at + 1)}${visitorCanPlace && hasRoom(column) ? ` Place your ${game.roll} here.` : ''}`}
                  >
                    <span className="bones-stack">
                      <ColumnDice column={column} />
                    </span>
                    <span className="bones-colscore">{columnScore(column)}</span>
                  </button>
                );
              })}
            </div>
            <div className="bones-who">
              <span>you</span>
              <b>{mine}</b>
            </div>
          </section>
        </div>

        <Rules />
      </div>
    </div>
  );
}
