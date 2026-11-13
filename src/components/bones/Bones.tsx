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
 * only paces the computer's turns and writes the log.
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

const WHO: Record<Player, string> = { 0: 'you', 1: 'cpu' };

/** One log line for a die just put down. */
function describe(before: Game, after: Game, at: ColumnIndex): string {
  const me = before.turn;
  const them: Player = me === 0 ? 1 : 0;
  const face = before.roll!;
  const knocked = before.boards[them][at].length - after.boards[them][at].length;
  const line = `${WHO[me]}: ${face} -> col ${at + 1}`;
  if (knocked === 0) return line;
  const whose = me === 0 ? "cpu's" : 'your';
  const what = knocked === 1 ? `${whose} ${face}` : `${knocked} of ${whose} ${face}s`;
  return `${line}  CONFLICT: ${what} removed`;
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

export default function Bones() {
  const [game, setGame] = useState<Game>(() => newGame(0));
  const [log, setLog] = useState<string[]>(['$ bones', 'new game. you go first.']);
  const [tally, setTally] = useState<Tally>({ won: 0, lost: 0, drawn: 0 });
  const [rolledAt, setRolledAt] = useState(0);
  const quick = useRef(false);
  const nextFirst = useRef<Player>(1);
  const logEnd = useRef<HTMLOListElement>(null);

  useEffect(() => {
    setTally(readTally());
    quick.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const write = (...lines: string[]) => setLog((l) => [...l, ...lines].slice(-40));

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
        write(describe(game, after, at));
        setGame(after);
      };
    } else {
      return;
    }
    const timer = window.setTimeout(step, wait);
    return () => window.clearTimeout(timer);
  }, [game]);

  // The end: one line for the result, and the tally kept.
  useEffect(() => {
    if (game.outcome === null) return;
    const [mine, theirs] = scores(game);
    const result =
      game.outcome === 'draw' ? `draw, ${mine} all.` : game.outcome === 0 ? `merged. you win ${mine} to ${theirs}.` : `rejected. cpu wins ${theirs} to ${mine}.`;
    write(result);
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

  useEffect(() => {
    const el = logEnd.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log]);

  const visitorCanPlace = game.outcome === null && game.turn === 0 && game.roll !== null;

  const put = (at: ColumnIndex) => {
    if (!visitorCanPlace || !hasRoom(game.boards[0][at])) return;
    const after = place(game, at);
    write(describe(game, after, at));
    setGame(after);
  };

  // 1, 2 and 3 put the die down, for anyone playing from the keyboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
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
    write('', '$ bones', `new game. ${first === 0 ? 'you go' : 'cpu goes'} first.`);
  };

  const [mine, theirs] = scores(game);
  const status =
    game.outcome !== null
      ? game.outcome === 'draw'
        ? 'Draw'
        : game.outcome === 0
          ? 'You win'
          : 'CPU wins'
      : game.turn === 0
        ? game.roll === null
          ? 'Rolling…'
          : 'Your move: pick a column'
        : 'CPU is thinking…';

  return (
    <div className="bones" data-turn={game.turn}>
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

      <div className="bones-term">
        <ol className="bones-log" ref={logEnd} aria-label="Game log">
          {log.map((line, i) => (
            <li key={i} className={line.includes('CONFLICT') ? 'conflict' : line.startsWith('$') ? 'prompt' : ''}>
              {line || ' '}
            </li>
          ))}
        </ol>
        {game.outcome !== null ? (
          <button type="button" className="bones-again" onClick={again}>
            play again
          </button>
        ) : null}
      </div>
    </div>
  );
}
