import test from 'node:test';
import assert from 'node:assert/strict';
import { BOARD_SIZE, CABINET_HEIGHT, CABINET_OUTER_SIZE, DRUEKE_HEIGHT_IN, DRUEKE_WIDTH_IN, MAX_TILT_RAD, MAX_TILT_DEG, TABLE_Y, clampBoardTilt, nextHoleState } from './mechanics.ts';
import { LEVELS, generateRandomMaze } from './levels.ts';
import { validateLevelPath } from './validator.ts';
import { validateHoleLayout } from './holeClearance.ts';
import { BALL_RADIUS, computeTiltFromHands } from './physics.ts';

test('all five authored levels use the identical chassis footprint and preserve reachable targets', () => {
  assert.equal(LEVELS.length, 5);
  for (const level of LEVELS) {
    assert.equal(level.boardSize, BOARD_SIZE, `level ${level.id}`);
    assert.ok(validateLevelPath(level, BALL_RADIUS).isSolvable, `level ${level.id}: reachable routes`);
    assert.ok(validateHoleLayout(level).valid, `level ${level.id}: hole trim clearance`);
  }
});

test('random levels use exactly the same board size and gimbal geometry', () => {
  for (const seed of [1, 2, 42, 1007, 9999]) {
    assert.equal(generateRandomMaze(seed).boardSize, BOARD_SIZE);
  }
});

test('tabletop enclosure proportions derive from documented Drueke 1960 envelope', () => {
  assert.ok(Math.abs(CABINET_HEIGHT / CABINET_OUTER_SIZE - DRUEKE_HEIGHT_IN / DRUEKE_WIDTH_IN) < 1e-9);
  assert.ok(TABLE_Y < -CABINET_HEIGHT + 0.4);
});

test('pitch, roll and diagonal tilt are all mechanically clamped to eight degrees', () => {
  assert.equal(MAX_TILT_DEG, 8);
  const cases = [
    { pitch: 0, roll: 1 }, { pitch: -1, roll: 0 },
    { pitch: 1, roll: 1 }, { pitch: -1, roll: -1 },
    { pitch: Infinity, roll: NaN },
  ];
  for (const c of cases) {
    const limited = clampBoardTilt(c);
    assert.ok(Math.hypot(limited.pitch, limited.roll) <= MAX_TILT_RAD + 1e-10);
    assert.ok(Number.isFinite(limited.pitch) && Number.isFinite(limited.roll));
  }
});

test('camera gesture sensitivity cannot exceed the new safe mechanical stop', () => {
  const pose = computeTiltFromHands(
    { x: 0.25, y: 0.01, confidence: 1 },
    { x: 0.75, y: 0.99, confidence: 1 },
    { neutralLeftY: .5, neutralRightY: .5, neutralAvgY: .5 },
    2.5, 'height-lever', 0,
  );
  assert.ok(Math.hypot(pose.pitch, pose.roll) <= MAX_TILT_RAD + 1e-9);
});

test('falling animation ends in a visible defeat state and stays there until explicit restart', () => {
  assert.equal(nextHoleState('playing', true, 0), 'falling');
  assert.equal(nextHoleState('falling', true, 0.95), 'falling');
  assert.equal(nextHoleState('falling', true, 1), 'fallen');
  assert.equal(nextHoleState('fallen', true, 1), 'fallen');
  assert.equal(nextHoleState('won', true, 1), 'won');
});
