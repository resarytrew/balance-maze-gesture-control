import test from 'node:test';
import assert from 'node:assert/strict';
import { COSMIC_MISSION, PORTALS, createMissionState, stepMission } from './mission.ts';
import { BALL_RADIUS } from './physics.ts';
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
