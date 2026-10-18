import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeTiltFromHands,
  stepPhysics,
  getClosestPointOnSegment,
  integrateQuaternion,
  applyGroundImpulse,
  solveGroundContact,
  BALL_RADIUS,
  GRAVITY,
} from './physics.ts';
import type { BallState, LevelConfig } from './types.ts';

const testLevel: LevelConfig = {
  id: 1,
  name: 'Test Level',
  difficulty: 'easy',
  description: 'Test level',
  boardSize: 10,
  startPos: { x: 0, z: 0 },
  goal: { x: 3, z: 3, radius: 0.8 },
  holes: [{ id: 'h1', x: 2, z: 0, radius: 0.8 }],
  gems: [{ id: 'g1', x: 0, z: 2, collected: false }],
  walls: [
    { id: 'w1', x1: -4, z1: -2, x2: 4, z2: -2, thickness: 0.3 }
  ],
};

function createTestBall(x = 0, z = 0, vx = 0, vz = 0): BallState {
  return {
    x,
    y: 0,
    z,
    vx,
    vy: 0,
    vz,
    radius: BALL_RADIUS,
    wx: 0,
    wy: 0,
    wz: 0,
    qx: 0,
    qy: 0,
    qz: 0,
    qw: 1,
    rotX: 0,
    rotZ: 0,
    isFalling: false,
    fallProgress: 0,
    slip: 0,
    holeVortexAngle: 0,
  };
}

test('computeTiltFromHands calculates zero tilt when hands are at neutral calibration', () => {
  const neutral = { neutralLeftY: 0.5, neutralRightY: 0.5, neutralAvgY: 0.5 };
  const left = { x: 0.3, y: 0.5, confidence: 1 };
  const right = { x: 0.7, y: 0.5, confidence: 1 };

  const tilt = computeTiltFromHands(left, right, neutral, 1.0);
  assert.ok(Math.abs(tilt.roll) < 0.001, 'roll should be approx 0');
  assert.ok(Math.abs(tilt.pitch) < 0.001, 'pitch should be approx 0');
});

test('computeTiltFromHands tilts roll right when left hand is higher (smaller Y)', () => {
  const neutral = { neutralLeftY: 0.5, neutralRightY: 0.5, neutralAvgY: 0.5 };
  const left = { x: 0.3, y: 0.3, confidence: 1 };
  const right = { x: 0.7, y: 0.7, confidence: 1 };

  const tilt = computeTiltFromHands(left, right, neutral, 1.0);
  assert.ok(tilt.roll > 0.1, `expected positive roll, got ${tilt.roll}`);
});

test('computeTiltFromHands tilts roll left when right hand is higher', () => {
  const neutral = { neutralLeftY: 0.5, neutralRightY: 0.5, neutralAvgY: 0.5 };
  const left = { x: 0.3, y: 0.7, confidence: 1 };
  const right = { x: 0.7, y: 0.3, confidence: 1 };

  const tilt = computeTiltFromHands(left, right, neutral, 1.0);
  assert.ok(tilt.roll < -0.1, `expected negative roll, got ${tilt.roll}`);
});

test('stepPhysics accelerates ball and spins angular velocity with moment of inertia', () => {
  const ball = createTestBall(0, 0, 0, 0);
  const tilt = { roll: 0.15, pitch: 0 }; // tilted to right (+X)
  const collected = new Set<string>();

  const result = stepPhysics(ball, tilt, testLevel, collected, 0.05);
  assert.ok(result.ball.vx > 0, `ball should gain positive vx, got ${result.ball.vx}`);
  assert.ok(result.ball.x > 0, `ball should move right, got ${result.ball.x}`);
  // Angular velocity wz should spin to match rolling vx
  assert.ok(result.ball.wz < 0, `ball angular velocity wz should be negative for +X rolling, got ${result.ball.wz}`);
  assert.ok(Math.abs(result.ball.vx + result.ball.wz * ball.radius) < 0.1, "pure rolling should have low contact slip");
});

test('integrateQuaternion preserves unit length normalization', () => {
  const q = integrateQuaternion(0, 0, 0, 1, 3.0, 1.5, 0.5, 0.02);
  const length = Math.sqrt(q.qx * q.qx + q.qy * q.qy + q.qz * q.qz + q.qw * q.qw);
  assert.ok(Math.abs(length - 1.0) < 0.0001, `quaternion must stay normalized, got length ${length}`);
});

test('a freely rolling ball coasts on level lacquer without artificial drag', () => {
  const noWalls = { ...testLevel, walls: [], holes: [], gems: [], goal: { x: 4, z: 4, radius: 0.2 } };
  const ball = createTestBall(0, 0, 2, 0);
  ball.wz = -ball.vx / ball.radius;
  const result = stepPhysics(ball, { pitch: 0, roll: 0 }, noWalls, new Set(), 0.4);
  assert.ok(result.ball.vx <= 2 && result.ball.vx > 1.98, `expected controlled rolling resistance, got ${result.ball.vx}`);
  assert.ok(result.ball.slip < 0.03, `clean rolling should retain no-slip contact, got ${result.ball.slip}`);
});

function kineticEnergy(ball: BallState) {
  const translational = 0.5 * (ball.vx ** 2 + ball.vy ** 2 + ball.vz ** 2);
  const inertia = (2 / 5) * ball.radius ** 2;
  const rotational = 0.5 * inertia * (ball.wx ** 2 + ball.wy ** 2 + ball.wz ** 2);
  return translational + rotational;
}

test('passive wood friction never injects kinetic energy into a spinning ball', () => {
  const noWalls = { ...testLevel, walls: [], holes: [], gems: [], goal: { x: 4, z: 4, radius: 0.2 } };
  let ball = createTestBall();
  ball.wz = 4; // pure spin: the contact patch initially slips to +X
  const initialEnergy = kineticEnergy(ball);
  const initialSlip = Math.abs(ball.vx + ball.wz * ball.radius);
  for (let i = 0; i < 5; i++) ball = stepPhysics(ball, { pitch: 0, roll: 0 }, noWalls, new Set(), 1 / 120).ball;
  assert.ok(kineticEnergy(ball) < initialEnergy, `friction must dissipate energy: ${kineticEnergy(ball)} >= ${initialEnergy}`);
  assert.ok(Math.abs(ball.vx + ball.wz * ball.radius) < initialSlip, 'contact slip must reduce rather than grow');
});

test('ground-contact impulse applies torque in the physical rolling direction', () => {
  const ball = createTestBall();
  applyGroundImpulse(ball, -0.1, 0.2);
  assert.ok(ball.vx < 0 && ball.vz > 0, 'impulse must change linear velocity');
  assert.ok(ball.wx < 0 && ball.wz < 0, 'r x J must spin the sphere in the matching direction');
});

test('static contact resolves a skid to no-slip without increasing energy', () => {
  const ball = createTestBall(1, 0);
  const initialEnergy = kineticEnergy(ball);
  for (let i = 0; i < 15; i++) solveGroundContact(ball, GRAVITY, 1 / 120);
  assert.ok(kineticEnergy(ball) <= initialEnergy + 1e-9);
  assert.ok(Math.abs(ball.vx + ball.wz * ball.radius) < 1e-7, 'contact must settle to pure rolling');
});

test('stepPhysics collides with walls and reflects velocity', () => {
  const ball = createTestBall(0, -1.3, 0, -3);
  const tilt = { roll: 0, pitch: 0 };
  const collected = new Set<string>();

  const result = stepPhysics(ball, tilt, testLevel, collected, 0.1);
  assert.ok(result.ball.vz > -0.5, `ball vz should be bounced or slowed, got ${result.ball.vz}`);
  assert.ok(result.collisionEvents.length > 0, 'collision event should be registered');
});

test('an exact overlap with a wall centre line resolves to a finite outward position', () => {
  const ball = createTestBall(0, -2, 0, 0);
  const result = stepPhysics(ball, { roll: 0, pitch: 0 }, testLevel, new Set(), 1 / 120);
  assert.ok(Number.isFinite(result.ball.x) && Number.isFinite(result.ball.z));
  assert.ok(Math.abs(result.ball.z + 2) > 0.1, `ball must leave the wall centre line, got ${result.ball.z}`);
});

test('a glancing wall impact transfers tangential motion into side-spin', () => {
  const ball = createTestBall(0, -1.3, 2, -3);
  const result = stepPhysics(ball, { roll: 0, pitch: 0 }, testLevel, new Set(), 0.1);
  assert.ok(result.ball.vz > -0.5, 'normal component must rebound from the wall');
  assert.ok(Math.abs(result.ball.wy) > 0.2, `wall friction should create yaw spin, got ${result.ball.wy}`);
});

test('stepPhysics captures ball when rolling into a hole', () => {
  const ball = createTestBall(1.9, 0, 1.0, 0);
  const tilt = { roll: 0.1, pitch: 0 };
  const collected = new Set<string>();

  const result = stepPhysics(ball, tilt, testLevel, collected, 0.1);
  assert.ok(result.ball.isFalling, 'ball should enter falling state');
  assert.equal(result.fellInHole?.id, 'h1');
});

test('a high-speed grazing pass does not receive magnetic pull from a hole', () => {
  const level = { ...testLevel, walls: [], gems: [], holes: [{ id: 'h', x: 0, z: 0, radius: 0.8 }] };
  const ball = createTestBall(1.4, -1.5, 0, 4);
  const result = stepPhysics(ball, { roll: 0, pitch: 0 }, level, new Set(), 0.025);
  assert.equal(result.ball.isFalling, false);
  assert.ok(result.ball.vx < 0.01 && result.ball.vx > -0.05, `unexpected radial pull: ${result.ball.vx}`);
});

test('stepPhysics detects gem collection', () => {
  const ball = createTestBall(0, 1.8, 0, 1);
  const tilt = { roll: 0, pitch: 0 };
  const collected = new Set<string>();

  const result = stepPhysics(ball, tilt, testLevel, collected, 0.1);
  assert.ok(collected.has('g1'), 'gem g1 should be collected');
  assert.ok(result.collectedGems.includes('g1'));
});

test('getClosestPointOnSegment finds accurate closest point and normal', () => {
  const point = getClosestPointOnSegment(2, -1, 0, -2, 4, -2);
  assert.equal(point.cx, 2);
  assert.equal(point.cz, -2);
  assert.ok(Math.abs(point.dist - 1.0) < 0.001);
  assert.equal(point.nx, 0);
  assert.equal(point.nz, 1);
});

test('ALL built-in levels are 100% physically solvable and all gems reachable', async () => {
  const { LEVELS } = await import('./levels.ts');
  const { validateLevelPath } = await import('./validator.ts');

  for (const lvl of LEVELS) {
    const val = validateLevelPath(lvl, BALL_RADIUS);
    assert.ok(
      val.isSolvable,
      `Level ${lvl.id} ("${lvl.name}") failed solvability validation: ${val.reason}`
    );
    assert.equal(val.reachableGemsCount, lvl.gems.length, `Level ${lvl.id} gems must all be reachable`);
  }
});

test('generateRandomMaze always produces 100% solvable labyrinths', async () => {
  const { generateRandomMaze } = await import('./levels.ts');
  const { validateLevelPath } = await import('./validator.ts');

  for (let s = 1; s <= 5; s++) {
    const maze = generateRandomMaze(1000 + s * 42);
    const val = validateLevelPath(maze, BALL_RADIUS);
    assert.ok(val.isSolvable, `Random maze seed ${1000 + s * 42} must be solvable`);
  }
});


test('positive pitch lowers +Z side of board and accelerates ball toward +Z', () => {
  const noWalls = { ...testLevel, walls: [], holes: [], gems: [], goal: { x: 4, z: 4, radius: 0.2 } };
  const out = stepPhysics(createTestBall(), { pitch: 0.15, roll: 0 }, noWalls, new Set(), 0.025);
  assert.ok(out.ball.vz > 0, `positive pitch must move along +Z, got ${out.ball.vz}`);
  assert.ok(out.ball.wx > 0, `positive +Z rolling must rotate around +X, got ${out.ball.wx}`);
  assert.ok(Math.abs(out.ball.vz - out.ball.wx * BALL_RADIUS) < 0.1);
});

test('falling progress uses full dt, not individual micro-step', () => {
  const fallingBall = { ...createTestBall(), isFalling: true, fallProgress: 0 };
  const result = stepPhysics(fallingBall, { pitch: 0, roll: 0 }, testLevel, new Set(), 0.025);
  assert.ok(Math.abs(result.ball.fallProgress - 0.07) < 0.001, `got ${result.ball.fallProgress}`);
});

test('rolling on nearly level hardwood retains most speed after one second', () => {
  const empty = { ...testLevel, walls: [], holes: [], gems: [], goal: { x: 8, z: 8, radius: 0.2 } };
  let ball = createTestBall(0, 0, 2, 0);
  ball.wz = -ball.vx / ball.radius;
  for (let i = 0; i < 120; i++) {
    ball = stepPhysics(ball, { pitch: 0, roll: 0 }, empty, new Set(), 1 / 120).ball;
  }
  assert.ok(ball.vx > 1.7, `rolling resistance should be small: ${ball.vx}`);
});

test('critical gimbal approaches a target without exceeding mechanical limit', async () => {
  const { stepBoardTiltDynamics } = await import('./physics.ts');
  let pose = { pitch: 0, roll: 0 };
  let speed = { pitch: 0, roll: 0 };
  for (let i = 0; i < 120; i++) {
    const step = stepBoardTiltDynamics(pose, speed, { pitch: 0.12, roll: 0.10 }, 1/120);
    pose = step.tilt;
    speed = step.angularVelocity;
    assert.ok(Math.hypot(pose.pitch, pose.roll) <= 8 * Math.PI / 180 + 1e-9);
  }
  assert.ok(Math.hypot(pose.pitch, pose.roll) > 0.13);
});
