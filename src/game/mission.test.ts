import test from 'node:test';
import assert from 'node:assert/strict';
import { COSMIC_MISSION, COSMIC_MISSIONS, PORTALS, activateStasis, createMissionState, getMissionPortals, requiredBeacons, STASIS_DURATION, STASIS_TIME_SCALE, stepMission } from './mission.ts';
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

test('all three chapters fit the existing physical tray and have reachable rescue beacons', () => {
  assert.equal(COSMIC_MISSIONS.length, 3);
  const half = BOARD_SIZE / 2 - PLAYFIELD_INSET - BALL_RADIUS;
  for (const stage of COSMIC_MISSIONS) {
    assert.equal(stage.boardSize, BOARD_SIZE);
    assert.ok(Math.max(Math.abs(stage.startPos.x),Math.abs(stage.startPos.z)) <= half);
    assert.ok(Math.max(Math.abs(stage.goal.x),Math.abs(stage.goal.z)) <= half);
    for (const item of [...stage.holes, ...stage.gems, ...getMissionPortals(stage)]) {
      assert.ok(Math.max(Math.abs(item.x),Math.abs(item.z)) <= half, stage.name + ': outside tray');
    }
    const validation = validateLevelPath(stage, BALL_RADIUS);
    assert.ok(validation.isSolvable, stage.name + ': ' + (validation.reason ?? 'unreachable'));
    assert.equal(validation.reachableGemsCount, stage.gems.length, stage.name + ': beacon blocked');
  }
});

test('each chapter portal preserves linear velocity and has a one-way cooldown', () => {
  for (const stage of COSMIC_MISSIONS) {
    const portals = getMissionPortals(stage);
    const entry = ball(portals[0].x,portals[0].z);
    const warp = stepMission(createMissionState(),entry,1/120,stage);
    assert.ok(warp.teleported,stage.name);
    assert.equal(warp.ball.vx,entry.vx);
    assert.equal(warp.ball.vz,entry.vz);
    assert.equal(warp.ball.x,portals[1].x);
    assert.equal(stepMission(warp.state,warp.ball,1/120,stage).teleported,false);
  }
});

test('beacons charge stasis once, activating it consumes one charge and slows time temporarily', () => {
  const first = COSMIC_MISSION.gems[0];
  const start = createMissionState();
  const touched = stepMission(start,ball(first.x,first.z),1/120);
  assert.equal(touched.state.charges,1);
  assert.equal(touched.state.beacons,1);
  const duplicate = stepMission(touched.state,ball(first.x,first.z),1/120);
  assert.equal(duplicate.state.charges,1);
  const active = activateStasis(touched.state);
  assert.equal(active.charges,0);
  assert.equal(active.stasisRemaining,STASIS_DURATION);
  assert.equal(activateStasis(active),active);
  assert.ok(STASIS_TIME_SCALE > 0 && STASIS_TIME_SCALE < 1);
  let timed = active;
  for (let i=0;i<400;i++) timed = stepMission(timed,ball(0,0),1/120).state;
  assert.equal(timed.stasisRemaining,0);
});

test('a finished chapter requires all of its rescue beacons', () => {
  for (const stage of COSMIC_MISSIONS) {
    let state = createMissionState();
    for (const gem of stage.gems) state = stepMission(state,ball(gem.x,gem.z),1/120,stage).state;
    assert.equal(state.beacons,requiredBeacons(stage),stage.name);
  }
});
