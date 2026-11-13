/**
 * Bones: the rules and the state of the game, and the computer that plays it.
 *
 * The rules are those of Knucklebones from Cult of the Lamb by Massive Monster
 * (docs/adr/0007). Plain TypeScript on purpose: no React and no Three, so `/play`
 * and the Laptop draw the same game, and the tests can run it with nothing else.
 *
 * Every function here returns a new value and never changes the one it is given.
 * Randomness is passed in, so a game can be replayed and a test can pin it.
 *
 * The rules:
 *  - Each player has three columns of three.
 *  - On a turn the player rolls one die and puts it in a column of theirs that has room.
 *  - Matching dice in a column multiply: a column scores, for each face in it,
 *    face x count x count. Two 4s are (4 + 4) x 2 = 16; three are 36.
 *  - Putting a die down knocks out every die of the same face in the opponent's
 *    column opposite.
 *  - The game ends as soon as either player's columns are all full. The higher
 *    total wins; equal totals draw.
 */

export type Face = 1 | 2 | 3 | 4 | 5 | 6;
/** The dice in one column, in the order they were put down. At most three. */
export type Column = readonly Face[];
export type Board = readonly [Column, Column, Column];
/** 0 is the visitor, 1 is the computer. */
export type Player = 0 | 1;
export type ColumnIndex = 0 | 1 | 2;

export interface Game {
  readonly boards: readonly [Board, Board];
  /** Whose turn it is. Meaningless once `outcome` is set. */
  readonly turn: Player;
  /** The die waiting to be put down, or null before the roll. */
  readonly roll: Face | null;
  readonly outcome: Player | 'draw' | null;
}

/** Returns a number in [0, 1), like Math.random. */
export type Random = () => number;

export const COLUMN_HEIGHT = 3;
export const COLUMNS: readonly ColumnIndex[] = [0, 1, 2];

const EMPTY_BOARD: Board = [[], [], []];

export function newGame(first: Player = 0): Game {
  return { boards: [EMPTY_BOARD, EMPTY_BOARD], turn: first, roll: null, outcome: null };
}

export function rollFace(random: Random): Face {
  return (Math.floor(random() * 6) + 1) as Face;
}

// ---------------------------------------------------------------- scoring

export function columnScore(column: Column): number {
  const counts = new Map<Face, number>();
  for (const face of column) counts.set(face, (counts.get(face) ?? 0) + 1);
  let score = 0;
  for (const [face, count] of counts) score += face * count * count;
  return score;
}

export function boardScore(board: Board): number {
  return board.reduce((sum, column) => sum + columnScore(column), 0);
}

export function scores(game: Game): [number, number] {
  return [boardScore(game.boards[0]), boardScore(game.boards[1])];
}

export function hasRoom(column: Column): boolean {
  return column.length < COLUMN_HEIGHT;
}

export function isFull(board: Board): boolean {
  return board.every((column) => !hasRoom(column));
}

export function openColumns(board: Board): ColumnIndex[] {
  return COLUMNS.filter((i) => hasRoom(board[i]));
}

// ---------------------------------------------------------------- a turn

/** Roll for the player whose turn it is. */
export function roll(game: Game, random: Random): Game {
  if (game.outcome !== null) throw new Error('The game is over.');
  if (game.roll !== null) throw new Error('The die is already rolled.');
  return { ...game, roll: rollFace(random) };
}

function withColumn(board: Board, at: ColumnIndex, column: Column): Board {
  return board.map((c, i) => (i === at ? column : c)) as unknown as Board;
}

/** Put the rolled die in a column of the player whose turn it is. */
export function place(game: Game, at: ColumnIndex): Game {
  if (game.outcome !== null) throw new Error('The game is over.');
  if (game.roll === null) throw new Error('Roll before placing.');

  const me = game.turn;
  const them: Player = me === 0 ? 1 : 0;
  const face = game.roll;
  const mine = game.boards[me];
  if (!hasRoom(mine[at])) throw new Error(`Column ${at} is full.`);

  const myBoard = withColumn(mine, at, [...mine[at], face]);
  const theirBoard = withColumn(
    game.boards[them],
    at,
    game.boards[them][at].filter((f) => f !== face)
  );
  const boards = (me === 0 ? [myBoard, theirBoard] : [theirBoard, myBoard]) as [Board, Board];

  // Only the player who just placed can have filled their board.
  let outcome: Game['outcome'] = null;
  if (isFull(myBoard)) {
    const [a, b] = [boardScore(boards[0]), boardScore(boards[1])];
    outcome = a === b ? 'draw' : a > b ? 0 : 1;
  }

  return { boards, turn: them, roll: null, outcome };
}

// ---------------------------------------------------------------- the computer

/**
 * How much noise the computer adds to each column's worth, in points. Enough that it
 * sometimes takes the second-best column, not so much that it throws away a stack.
 */
const NOISE = 4;
/** How much the computer minds leaving dice where the next roll could knock them out. */
const CAUTION = 0.5;

/** What one column is worth to the player about to put `face` in it. */
function worth(mine: Board, theirs: Board, at: ColumnIndex, face: Face): number {
  const column = [...mine[at], face];
  const gained = columnScore(column) - columnScore(mine[at]);
  const taken = columnScore(theirs[at]) - columnScore(theirs[at].filter((f) => f !== face));

  // What the opponent could knock out of this column next turn, on average, if it
  // still has room on their side to put a die opposite.
  let exposed = 0;
  const theirsAfter = theirs[at].filter((f) => f !== face);
  if (hasRoom(theirsAfter)) {
    for (const f of new Set(column)) {
      exposed += (columnScore(column) - columnScore(column.filter((d) => d !== f))) / 6;
    }
  }

  // Filling the last space ends the game, but there is never a choice about it: the
  // last space is the only open column. So the end needs no weighing here.
  return gained + taken - CAUTION * exposed;
}

/** The column the player whose turn it is would choose for the rolled die. */
export function chooseColumn(game: Game, random: Random): ColumnIndex {
  if (game.roll === null) throw new Error('Roll before choosing.');
  const me = game.turn;
  const mine = game.boards[me];
  const theirs = game.boards[me === 0 ? 1 : 0];
  const open = openColumns(mine);
  if (open.length === 0) throw new Error('No column has room.');

  let best = open[0];
  let bestValue = -Infinity;
  for (const at of open) {
    const value = worth(mine, theirs, at, game.roll) + (random() - 0.5) * NOISE;
    if (value > bestValue) {
      best = at;
      bestValue = value;
    }
  }
  return best;
}
