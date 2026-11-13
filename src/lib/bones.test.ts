import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  boardScore,
  chooseColumn,
  columnScore,
  newGame,
  openColumns,
  place,
  roll,
  rollFace,
  scores,
  type Board,
  type Face,
  type Game,
  type Random,
} from './bones.ts';

/** A Random that always returns the same number. */
const fixed = (n: number): Random => () => n;
/** A Random that always rolls this face. */
const rolls = (face: Face): Random => fixed((face - 1) / 6 + 0.01);

/** A game mid-play, with the given boards and die. */
function at(boards: [Board, Board], face: Face, turn: 0 | 1 = 0): Game {
  return { boards, turn, roll: face, outcome: null };
}

test('a column scores face x count x count for each face', () => {
  assert.equal(columnScore([]), 0);
  assert.equal(columnScore([1, 2, 3]), 6);
  assert.equal(columnScore([4, 4]), 16);
  assert.equal(columnScore([4, 4, 4]), 36);
  assert.equal(columnScore([2, 5, 2]), 13);
  assert.equal(boardScore([[6, 6], [1], [3, 3, 3]]), 24 + 1 + 27);
});

test('a roll lands on every face and nothing else', () => {
  assert.equal(rollFace(fixed(0)), 1);
  assert.equal(rollFace(fixed(0.999999)), 6);
  for (let f = 1; f <= 6; f++) assert.equal(rollFace(rolls(f as Face)), f);
});

test('a turn is a roll and then a place, and passes to the other player', () => {
  let game = newGame(0);
  assert.throws(() => place(game, 0), /Roll before placing/);
  game = roll(game, rolls(5));
  assert.equal(game.roll, 5);
  assert.throws(() => roll(game, rolls(2)), /already rolled/);
  game = place(game, 1);
  assert.deepEqual(game.boards[0], [[], [5], []]);
  assert.equal(game.turn, 1);
  assert.equal(game.roll, null);
});

test('placing never changes the game it is given', () => {
  const before = at([[[2], [], []], [[2], [], []]], 2);
  const snapshot = JSON.stringify(before);
  place(before, 0);
  assert.equal(JSON.stringify(before), snapshot);
});

test('a die knocks out matching dice in the opposite column only', () => {
  const game = at(
    [
      [[], [], []],
      [[4, 1, 4], [4], []],
    ],
    4
  );
  const after = place(game, 0);
  assert.deepEqual(after.boards[0][0], [4]);
  assert.deepEqual(after.boards[1], [[1], [4], []]);
});

test('the computer knocks out the visitor in the same way', () => {
  const game = at(
    [
      [[], [6, 6], []],
      [[], [], []],
    ],
    6,
    1
  );
  const after = place(game, 1);
  assert.deepEqual(after.boards[0][1], []);
  assert.deepEqual(after.boards[1][1], [6]);
});

test('a full column takes no more dice', () => {
  const game = at([[[1, 2, 3], [], []], [[], [], []]], 5);
  assert.throws(() => place(game, 0), /full/);
  assert.deepEqual(openColumns(game.boards[0]), [1, 2]);
});

test('the game ends when a board fills, and the higher total wins', () => {
  const nearlyFull: Board = [[6, 6, 6], [5, 5, 5], [4, 4]];
  const won = place(at([nearlyFull, [[1], [1], [1]]], 4), 2);
  assert.equal(won.outcome, 0);
  assert.deepEqual(scores(won), [54 + 45 + 36, 3]);

  const lost = place(at([[[1, 2, 3], [1, 2, 3], [1, 2]], [[6, 6], [6, 6], [6]]], 3), 2);
  assert.equal(lost.outcome, 1);
  assert.throws(() => roll(lost, rolls(1)), /over/);
});

test('equal totals at the end are a draw', () => {
  // The visitor finishes on 6 + 6 + 6; the computer holds 6 + 6 + 6.
  const level = place(at([[[1, 2, 3], [1, 2, 3], [1, 2]], [[6], [6], [6]]], 3), 2);
  assert.equal(level.outcome, 'draw');
});

test('the computer only ever chooses a column with room', () => {
  const game = at([[[], [], []], [[1, 2, 3], [4, 5, 6], []]], 2, 1);
  for (const n of [0, 0.25, 0.5, 0.75, 0.99]) assert.equal(chooseColumn(game, fixed(n)), 2);
});

test('the computer takes a big stack off the board when it can', () => {
  // A 5 on the left knocks out 45 points; anywhere else gains it 5.
  const game = at([[[5, 5, 5], [], []], [[], [], []]], 5, 1);
  for (const n of [0, 0.5, 0.99]) assert.equal(chooseColumn(game, fixed(n)), 0);
});

test('the computer builds on a pair rather than starting fresh', () => {
  const game = at([[[], [], []], [[], [3, 3], []]], 3, 1);
  for (const n of [0, 0.5, 0.99]) assert.equal(chooseColumn(game, fixed(n)), 1);
});

test('a whole game between two computers always finishes', () => {
  let seed = 7;
  const random: Random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  for (let g = 0; g < 200; g++) {
    let game = newGame((g % 2) as 0 | 1);
    let turns = 0;
    while (game.outcome === null) {
      game = roll(game, random);
      game = place(game, chooseColumn(game, random));
      assert.ok(++turns < 500, 'a game ran past 500 turns');
    }
    const [a, b] = scores(game);
    assert.equal(game.outcome, a === b ? 'draw' : a > b ? 0 : 1);
  }
});
