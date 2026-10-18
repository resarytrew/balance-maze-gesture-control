import test from 'node:test';
import assert from 'node:assert/strict';
import { COSMIC_MISSION, PORTALS, createMissionState, stepMission } from './mission.ts';
import { BALL_RADIUS, stepPhysics } from './physics.ts';
import { BOARD_SIZE, PLAYFIELD_INSET } from './mechanics.ts';
import { validateLevelPath } from './validator.ts';
import type { BallState } from './types.ts';

function ball(x: number, z: number): BallState {
  return {
    x, y: 0, z, vx: 2, vy: 0, vz: -1, radius: BALL_RADIUS,
    wx: 0, wy: 0, wz: 0, qx: 0, qy: 0, qz: 0, qw: 1,
    rotX: 0, rotZ: 0, isFalling: false, fallProgress: 0,
    slip: 0, holeVortexAngle: 0,
  };
}
test('rescue mission always starts with 0/2 beacons', () => {
  assert.equal(COSMIC_MISSION.gems.length, 2);
  assert.equal(createMissionState().beacons, 0);
});
test('activating both beacons is idempotent', () => {
  let state = createMissionState();
  for (const beacon of COSMIC_MISSION.gems) {
    state = stepMission(state, ball(beacon.x, beacon.z), 1/120).state;
  }
  assert.equal(state.beacons, 2);
  assert.equal(stepMission(state, ball(COSMIC_MISSION.gems[0].x, COSMIC_MISSION.gems[0].z), 1/120).state.beacons, 2);
});
test('portals preserve speed and use cooldown to avoid looping', () => {
  const start = ball(PORTALS[0].x, PORTALS[0].z);
  const first = stepMission(createMissionState(), start, 1/120);
  assert.ok(first.teleported);
  assert.equal(first.ball.x, PORTALS[1].x);
  assert.equal(first.ball.z, PORTALS[1].z);
  assert.equal(first.ball.vx, start.vx);
  assert.equal(first.ball.vz, start.vz);
  const second = stepMission(first.state, first.ball, 1/120);
  assert.equal(second.teleported, false);
});

test('mission shares the physical 18-unit tray and all objects fit inside it', () => {
  assert.equal(COSMIC_MISSION.boardSize, BOARD_SIZE);
  const half = BOARD_SIZE / 2 - PLAYFIELD_INSET - BALL_RADIUS;
  const inside = (x: number, z: number) => Math.max(Math.abs(x), Math.abs(z)) <= half;
  assert.ok(inside(COSMIC_MISSION.startPos.x, COSMIC_MISSION.startPos.z));
  assert.ok(inside(COSMIC_MISSION.goal.x, COSMIC_MISSION.goal.z));
  for (const item of [...COSMIC_MISSION.gems, ...COSMIC_MISSION.holes, ...PORTALS]) {
    assert.ok(inside(item.x, item.z), `object outside physical tray: ${JSON.stringify(item)}`);
  }
});
test('mission route and both rescue beacons are reachable', () => {
  const result = validateLevelPath(COSMIC_MISSION, BALL_RADIUS);
  assert.ok(result.isSolvable, result.reason ?? 'mission route is blocked');
  assert.equal(result.reachableGemsCount, COSMIC_MISSION.gems.length);
});
test('ball collides with the physical tray boundary instead of entering frame', () => {
  const half = BOARD_SIZE / 2 - PLAYFIELD_INSET - BALL_RADIUS;
  let start = ball(half - 0.02, 0);
  start.vx = 12;
  start.wz = -start.vx / BALL_RADIUS;
  const result = stepPhysics(start, { pitch: 0, roll: 0 }, COSMIC_MISSION, new Set(), 1 / 60);
  assert.ok(result.ball.x <= half + 1e-8, `ball entered frame at ${result.ball.x}`);
});
