import test from 'node:test';
import assert from 'node:assert/strict';
import { computeTiltFromHands } from './physics.ts';
import { LEVELS, generateRandomMaze } from './levels.ts';
import { validateHoleLayout } from './holeClearance.ts';
import { validateLevelPath } from './validator.ts';
import type { LevelConfig } from './types.ts';

const neutral = { neutralLeftY: 0.5, neutralRightY: 0.5, neutralAvgY: 0.5, neutralDepthSize: 0.14 };
const hand = (x: number, y: number, apparentSize = 0.14) => ({ x, y, apparentSize, confidence: 1 });

test('height mode uses both hands vertical movement for pitch', () => {
  const t = computeTiltFromHands(hand(0.3, 0.35), hand(0.7, 0.35), neutral, 1, 'height-lever');
  assert.ok(t.pitch > 0.1, `expected pitch from raised hands, got ${t.pitch}`);
});

test('board mode uses apparent palm depth and ignores vertical movement for pitch', () => {
  const normal = computeTiltFromHands(hand(0.3, 0.35), hand(0.7, 0.35), neutral, 1, 'virtual-board');
  assert.equal(normal.pitch, 0, 'moving hands vertically should not affect board-mode pitch');
  const near = computeTiltFromHands(hand(0.3, 0.5, 0.19), hand(0.7, 0.5, 0.19), neutral, 1, 'virtual-board');
  const far = computeTiltFromHands(hand(0.3, 0.5, 0.095), hand(0.7, 0.5, 0.095), neutral, 1, 'virtual-board');
  assert.ok(near.pitch > 0.1, 'nearer hands should cause one pitch direction');
  assert.ok(far.pitch < -0.1, 'farther hands should cause opposite pitch direction');
  const fallback = computeTiltFromHands(hand(0.3, 0.3, 0), hand(0.7, 0.3, 0), neutral, 1, 'virtual-board');
  assert.equal(fallback.pitch, 0, 'invalid depth must never generate pitch');
});

test('left/right bank keeps the same semantics in both camera modes', () => {
  for (const mode of ['virtual-board', 'height-lever'] as const) {
    const t = computeTiltFromHands(hand(0.3, 0.35), hand(0.7, 0.65), neutral, 1, mode);
    assert.ok(t.roll > 0.1, `${mode}: expected right bank`);
  }
});

test('all five authored levels keep clear brass hole rims and solvable paths', () => {
  assert.equal(LEVELS.length, 5);
  for (const level of LEVELS) {
    const holeCheck = validateHoleLayout(level);
    assert.deepEqual(holeCheck.errors, [], `level ${level.id}: ${holeCheck.errors.join(', ')}`);
    assert.ok(validateLevelPath(level).isSolvable, `level ${level.id}: path must remain possible`);
  }
});

test('hole rim validator rejects a trap that overlaps an internal wall', () => {
  const level: LevelConfig = {
    id: 100, name: 'bad', difficulty: 'medium', description: '', boardSize: 14,
    startPos: { x: -4, z: -4 }, goal: { x: 4, z: 4, radius: 0.8 },
    walls: [{ id: 'wall', x1: -2, z1: 0, x2: 2, z2: 0, thickness: 0.35 }],
    gems: [], holes: [{ id: 'trap', x: 0, z: 0.5, radius: 0.75 }],
  };
  const check = validateHoleLayout(level);
  assert.equal(check.valid, false);
  assert.ok(check.errors.some(e => e.includes('wall:wall')));
});

test('300 different random mazes have five safe holes and reachable goals', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const level = generateRandomMaze(seed);
    assert.equal(level.holes.length, 5, `seed ${seed} should keep five traps`);
    assert.deepEqual(validateHoleLayout(level).errors, [], `seed ${seed}: visual intersection`);
    assert.ok(validateLevelPath(level).isSolvable, `seed ${seed}: unsolvable`);
  }
});
