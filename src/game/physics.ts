import type { BallState, HandPoint, Hole, LevelConfig, TiltState, Wall } from './types.ts';
import { clampBoardTilt, MAX_TILT_RAD } from './mechanics.ts';
export { MAX_TILT_RAD } from './mechanics.ts';

// Physical constants for a polished chrome-steel ball on lacquered hardwood.
// World units are intentionally game-scaled, but the ratios below follow a
// solid sphere rolling on a rigid wooden surface.
export const GRAVITY = 32.0; // units/s^2
// Rolling resistance is a physical torque, not a per-frame velocity multiplier.
export const ROLLING_RESISTANCE = 0.0025; // dimensionless rolling resistance; a small contact torque
export const WOOD_KINETIC_FRICTION = 0.22; // sliding friction coefficient
export const WOOD_STATIC_FRICTION = 0.38; // static friction coefficient
export const WALL_RESTITUTION = 0.44; // bounciness against hardwood wall
export const WALL_TANGENT_FRICTION = 0.18; // tangential impulse cap against wall
export const BALL_RADIUS = 0.48;
export const BALL_MASS = 1.0; // normalized mass

/**
 * Calculates board tilt (pitch & roll in radians) from two tracked hands.
 * Hand coordinates are normalized [0, 1] with (0,0) at top-left.
 * Note: Lower Y value in screen coords means physically higher hand!
 */
export function computeTiltFromHands(
  leftHand: HandPoint | null,
  rightHand: HandPoint | null,
  calibration: { neutralLeftY: number; neutralRightY: number; neutralAvgY: number; neutralDistX?: number; neutralDepthSize?: number } =
    { neutralLeftY: 0.5, neutralRightY: 0.5, neutralAvgY: 0.5, neutralDistX: 0.5 },
  sensitivity = 1.0,
  controlProfile: 'virtual-board' | 'height-lever' = 'height-lever',
  deadzone = 0.015
): TiltState {
  if (!leftHand || !rightHand) {
    return { pitch: 0, roll: 0 };
  }

  // Delta Y between left and right hand:
  // If left hand is higher than right hand (leftHand.y < rightHand.y),
  // then diffY is negative. The user is tilting right (right side down).
  const currentDiffY = rightHand.y - leftHand.y;
  const neutralDiffY = calibration.neutralRightY - calibration.neutralLeftY;
  let relativeDiffY = currentDiffY - neutralDiffY;

  // Apply deadzone to roll to eliminate minor hand tremor
  if (Math.abs(relativeDiffY) < deadzone) {
    relativeDiffY = 0;
  } else {
    relativeDiffY = (relativeDiffY - Math.sign(relativeDiffY) * deadzone) / (1 - deadzone);
  }

  // Both control schemes use relative hand height for left/right bank.
  let roll = relativeDiffY * 2.4 * sensitivity;
  let pitch = 0;

  if (controlProfile === 'virtual-board') {
    // Real forward/back hand motion is not directly available from monocular
    // MediaPipe wrist Z (which is wrist-relative). Apparent palm size is a
    // calibrated perspective proxy for distance to the camera, not true depth.
    // Moving both palms TOWARD the camera increases apparent size.
    const l = leftHand.apparentSize;
    const r = rightHand.apparentSize;
    const neutral = calibration.neutralDepthSize;
    if (l !== undefined && r !== undefined && l > 0.015 && r > 0.015 && neutral && neutral > 0.015) {
      const depthRatio = ((l + r) / 2 - neutral) / neutral;
      const depthDeadzone = 0.075; // suppress natural changes in hand orientation
      const usable = Math.sign(depthRatio) * Math.max(0, Math.abs(depthRatio) - depthDeadzone);
      pitch = usable * 1.0 * sensitivity;
    }
  } else {
    // Reliable two-dimensional height control (works on fallback trackers).
    const currentAvgY = (leftHand.y + rightHand.y) / 2;
    let relativeAvgY = currentAvgY - calibration.neutralAvgY;
    if (Math.abs(relativeAvgY) < deadzone) relativeAvgY = 0;
    else relativeAvgY = (relativeAvgY - Math.sign(relativeAvgY) * deadzone) / (1 - deadzone);
    pitch = -relativeAvgY * 2.5 * sensitivity;
  }

  // A diagonal gesture must obey the same mechanical angle limit.
  return clampBoardTilt({ pitch, roll });
}

/**
 * Checks distance from point (px, pz) to line segment (x1, z1)-(x2, z2).
 * Returns distance, closest point on segment, and normal vector.
 */
export function getClosestPointOnSegment(
  px: number,
  pz: number,
  x1: number,
  z1: number,
  x2: number,
  z2: number
) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const lenSq = dx * dx + dz * dz;

  let t = 0;
  if (lenSq > 0.000001) {
    t = ((px - x1) * dx + (pz - z1) * dz) / lenSq;
    t = Math.max(0, Math.min(1, t));
  }

  const cx = x1 + t * dx;
  const cz = z1 + t * dz;
  const distSq = (px - cx) * (px - cx) + (pz - cz) * (pz - cz);
  const dist = Math.sqrt(distSq);

  let nx = 0;
  let nz = 0;
  if (dist > 0.000001) {
    nx = (px - cx) / dist;
    nz = (pz - cz) / dist;
  }

  return { cx, cz, dist, nx, nz, t };
}

/**
 * Integrates quaternion rotation from angular velocity vector (wx, wy, wz).
 */
export function integrateQuaternion(
  qx: number,
  qy: number,
  qz: number,
  qw: number,
  wx: number,
  wy: number,
  wz: number,
  dt: number
) {
  const halfDt = dt * 0.5;
  const dqx = (wx * qw + wy * qz - wz * qy) * halfDt;
  const dqy = (wy * qw + wz * qx - wx * qz) * halfDt;
  const dqz = (wz * qw + wx * qy - wy * qx) * halfDt;
  const dqw = (-wx * qx - wy * qy - wz * qz) * halfDt;

  let nx = qx + dqx;
  let ny = qy + dqy;
  let nz = qz + dqz;
  let nw = qw + dqw;

  const len = Math.sqrt(nx * nx + ny * ny + nz * nz + nw * nw);
  if (len > 0.00001) {
    nx /= len;
    ny /= len;
    nz /= len;
    nw /= len;
  }

  return { qx: nx, qy: ny, qz: nz, qw: nw };
}

/**
 * Critically damped second-order gimbal response. Hand tracking selects the
 * target angle; this is the physical board state used by both rendering and
 * the ball solver. Unlike exponential smoothing it retains momentum when the
 * player reverses direction, while settling without visual overshoot.
 */
/** A critically damped physical gimbal, integrated at the fixed simulation step. */
export function stepBoardTiltDynamics(
  current: TiltState,
  angularVelocity: TiltState,
  target: TiltState,
  dt: number,
  responseHz = 3.2,
) {
  const safeTarget = clampBoardTilt(target);
  const omega = 2 * Math.PI * responseHz;
  const integrate = (position: number, speed: number, desired: number) => {
    const acceleration = omega * omega * (desired - position) - 2 * omega * speed;
    const nextSpeed = speed + acceleration * dt;
    return { position: position + nextSpeed * dt, speed: nextSpeed };
  };
  const pitch = integrate(current.pitch, angularVelocity.pitch, safeTarget.pitch);
  const roll = integrate(current.roll, angularVelocity.roll, safeTarget.roll);
  const limited = clampBoardTilt({ pitch: pitch.position, roll: roll.position });
  const clamped = Math.hypot(limited.pitch - pitch.position, limited.roll - roll.position) > 1e-8;
  return {
    tilt: limited,
    angularVelocity: clamped ? { pitch: 0, roll: 0 } : { pitch: pitch.speed, roll: roll.speed },
  };
}

const SPHERE_INERTIA_FACTOR = 2 / 5;
const GROUND_EFFECTIVE_MASS_FACTOR = 1 + 1 / SPHERE_INERTIA_FACTOR; // 7 / 2

/**
 * Applies an impulse at the sphere's bottom contact. With r=(0,-R,0), the
 * torque is r x J = (-R*Jz, 0, R*Jx), so friction removes relative contact
 * motion instead of injecting energy into the ball.
 */
export function applyGroundImpulse(ball: BallState, impulseX: number, impulseZ: number) {
  const inverseMass = 1 / BALL_MASS;
  const inverseInertia = 1 / (SPHERE_INERTIA_FACTOR * BALL_MASS * ball.radius * ball.radius);
  ball.vx += impulseX * inverseMass;
  ball.vz += impulseZ * inverseMass;
  ball.wx -= ball.radius * impulseZ * inverseInertia;
  ball.wz += ball.radius * impulseX * inverseInertia;
}

/**
 * Resolves the wood contact with a static Coulomb impulse when possible, then
 * falls back to kinetic friction when a skid exceeds the friction cone. It
 * never overwrites the ball's spin after a wall collision.
 */
export function solveGroundContact(
  ball: BallState,
  normalAcceleration: number,
  dt: number,
): 'static' | 'kinetic' | 'settled' {
  const slipX = ball.vx + ball.wz * ball.radius;
  const slipZ = ball.vz - ball.wx * ball.radius;
  const slip = Math.hypot(slipX, slipZ);
  if (slip < 1e-9) return 'settled';

  const wantedImpulseX = -BALL_MASS * slipX / GROUND_EFFECTIVE_MASS_FACTOR;
  const wantedImpulseZ = -BALL_MASS * slipZ / GROUND_EFFECTIVE_MASS_FACTOR;
  const requiredImpulse = Math.hypot(wantedImpulseX, wantedImpulseZ);
  const staticLimit = WOOD_STATIC_FRICTION * BALL_MASS * normalAcceleration * dt;
  if (requiredImpulse <= staticLimit + 1e-10) {
    applyGroundImpulse(ball, wantedImpulseX, wantedImpulseZ);
    return 'static';
  }

  const kineticLimit = WOOD_KINETIC_FRICTION * BALL_MASS * normalAcceleration * dt;
  const impulse = Math.min(requiredImpulse, kineticLimit);
  applyGroundImpulse(ball, -slipX / slip * impulse, -slipZ / slip * impulse);
  return 'kinetic';
}

/** Contact torque opposes rolling spin; the ground solver resolves the resulting slip. */
export function applyRollingResistanceTorque(ball: BallState, normalAccel: number, dt: number) {
  const speed = Math.hypot(ball.vx, ball.vz);
  const slip = Math.hypot(ball.vx + ball.wz * ball.radius, ball.vz - ball.wx * ball.radius);
  if (speed < 1e-6 || slip > 0.04) return;
  const rollingWx = ball.vz / ball.radius;
  const rollingWz = -ball.vx / ball.radius;
  const rollingSpin = Math.hypot(rollingWx, rollingWz);
  if (rollingSpin < 1e-6) return;
  const inertia = SPHERE_INERTIA_FACTOR * BALL_MASS * ball.radius ** 2;
  const torque = ROLLING_RESISTANCE * BALL_MASS * normalAccel * ball.radius;
  const delta = Math.min(rollingSpin, torque / inertia * dt);
  ball.wx -= rollingWx / rollingSpin * delta;
  ball.wz -= rollingWz / rollingSpin * delta;
}

/** Repeatable microscopic grain relief; never per-frame random noise. */
export function woodSurfaceGradient(x: number, z: number) {
  const gx = 0.00044 * (1.17 * Math.cos(1.17 * x + 0.44 * z) + 0.33 * Math.cos(0.71 * x - 0.33 * z));
  const gz = 0.00044 * (0.44 * Math.cos(1.17 * x + 0.44 * z) - 0.71 * Math.cos(0.71 * x - 0.33 * z));
  return { x: gx, z: gz };
}

/**
 * Resolves an impact with a vertical wall whose normal points from the wall
 * toward the ball. The normal impulse rebounds the sphere; the clamped
 * tangential impulse transfers a believable amount of side-spin.
 */
function resolveVerticalWallImpact(ball: BallState, nx: number, nz: number) {
  const normalSpeed = ball.vx * nx + ball.vz * nz;
  if (normalSpeed >= 0) return 0;

  // Wood is almost inelastic at a quiet touch, but a hard steel impact should
  // still rebound. Smooth interpolation prevents a discontinuity at the
  // sound-event threshold.
  const approaching = -normalSpeed;
  const blend = Math.min(1, Math.max(0, (approaching - 0.3) / 3));
  const restitution = 0.035 + (WALL_RESTITUTION - 0.035) * blend * blend * (3 - 2 * blend);
  const normalImpulse = -(1 + restitution) * normalSpeed * BALL_MASS;
  ball.vx += nx * normalImpulse / BALL_MASS;
  ball.vz += nz * normalImpulse / BALL_MASS;

  const tangentX = -nz;
  const tangentZ = nx;
  // Contact velocity includes yaw spin around the vertical axis. Rolling spin
  // does not create tangential speed at a vertical sphere-wall contact.
  const tangentSpeed = ball.vx * tangentX + ball.vz * tangentZ + ball.wy * ball.radius;
  const inverseInertia = 1 / (SPHERE_INERTIA_FACTOR * BALL_MASS * ball.radius * ball.radius);
  const tangentEffectiveMass = 1 / BALL_MASS + ball.radius * ball.radius * inverseInertia;
  const wantedTangentImpulse = -tangentSpeed / tangentEffectiveMass;
  const tangentLimit = WALL_TANGENT_FRICTION * normalImpulse;
  const tangentImpulse = Math.max(-tangentLimit, Math.min(tangentLimit, wantedTangentImpulse));

  ball.vx += tangentX * tangentImpulse / BALL_MASS;
  ball.vz += tangentZ * tangentImpulse / BALL_MASS;
  ball.wy += ball.radius * tangentImpulse * inverseInertia;
  return Math.abs(normalSpeed);
}

export interface StepResult {
  ball: BallState;
  collisionEvents: { impactSpeed: number; x: number; z: number; isCorner: boolean }[];
  fellInHole: Hole | null;
  reachedGoal: boolean;
  collectedGems: string[];
}

/**
 * Ultra-realistic simulation step for metallic ball rolling on tilted wooden labyrinth.
 * Features:
 * - True 5/7 moment of inertia rolling acceleration
 * - Transition between skid/slide and pure rolling
 * - 3D angular momentum & quaternion rotation
 * - Hole lip vortex physics (orbit & escape, or fall)
 * - Wall friction spin coupling
 */
export function stepPhysics(
  ball: BallState,
  tilt: TiltState,
  level: LevelConfig,
  collectedGemIds: Set<string>,
  dt: number
): StepResult {
  const safeTilt = clampBoardTilt(tilt);
  const newBall: BallState = { ...ball };
  const collisionEvents: { impactSpeed: number; x: number; z: number; isCorner: boolean }[] = [];
  let fellInHole: Hole | null = null;
  let reachedGoal = false;
  const newlyCollectedGems: string[] = [];

  // Clamp dt to avoid tunneling, use micro sub-stepping
  const clampedDt = Math.min(dt, 0.05);
  // High-speed travel gets more contact samples, so a ball cannot cross a
  // narrow rail or a rounded end-cap between two fixed simulation steps.
  const travelSubSteps = Math.ceil((Math.hypot(newBall.vx, newBall.vz) * clampedDt) / (newBall.radius * 0.28));
  const subSteps = Math.max(2, Math.min(20, Math.max(Math.ceil(clampedDt / 0.005), travelSubSteps)));
  const stepDt = clampedDt / subSteps;

  // If already falling down a hole
  if (newBall.isFalling) {
    newBall.fallProgress = Math.min(1, newBall.fallProgress + clampedDt * 2.8);
    newBall.y = -newBall.fallProgress * 1.8;
    // Once support is lost, gravity owns the animation; no artificial vortex
    // pulls the trajectory sideways or spins it up.
    newBall.vx *= Math.exp(-2.8 * clampedDt);
    newBall.vz *= Math.exp(-2.8 * clampedDt);
    newBall.wy *= Math.exp(-1.2 * clampedDt);

    const quat = integrateQuaternion(
      newBall.qx,
      newBall.qy,
      newBall.qz,
      newBall.qw,
      newBall.wx,
      newBall.wy,
      newBall.wz,
      clampedDt
    );
    newBall.qx = quat.qx;
    newBall.qy = quat.qy;
    newBall.qz = quat.qz;
    newBall.qw = quat.qw;

    return {
      ball: newBall,
      collisionEvents,
      fellInHole: null,
      reachedGoal: false,
      collectedGems: newlyCollectedGems,
    };
  }

  const R = newBall.radius;
  const halfSize = level.boardSize / 2 - 0.42;

  for (let s = 0; s < subSteps; s++) {
    // 1. Gravity components along board surface
    // Roll tilts around Z: positive roll tilts +X down
    // Pitch tilts around X: positive pitch lowers +Z (Three.js rotation.x).
    // The normal contact force drives friction and microscopic surface response.
    const normalAcceleration = GRAVITY * Math.cos(safeTilt.pitch) * Math.cos(safeTilt.roll);
    const micro = woodSurfaceGradient(newBall.x, newBall.z);
    const gx = GRAVITY * Math.sin(safeTilt.roll) - normalAcceleration * micro.x;
    const gz = GRAVITY * Math.sin(safeTilt.pitch) - normalAcceleration * micro.z;
    newBall.vx += gx * stepDt;
    newBall.vz += gz * stepDt;
    solveGroundContact(newBall, normalAcceleration, stepDt);

    // Resist spin with a tiny torque, then restore no-slip contact if possible.
    applyRollingResistanceTorque(newBall, normalAcceleration, stepDt);
    solveGroundContact(newBall, normalAcceleration, stepDt);
    const speed = Math.hypot(newBall.vx, newBall.vz);
    const slip = Math.hypot(newBall.vx + newBall.wz * R, newBall.vz - newBall.wx * R);
    if (speed < 0.00018 && slip < 0.00018 && Math.hypot(gx, gz) < ROLLING_RESISTANCE * normalAcceleration) {
      newBall.vx = newBall.vz = newBall.wx = newBall.wz = 0;
    }
    newBall.wy *= Math.exp(-0.22 * stepDt);
    newBall.slip = Math.min(1, slip / 2);

    // Integrate position
    newBall.x += newBall.vx * stepDt;
    newBall.z += newBall.vz * stepDt;

    // Integrate true 3D rotation quaternion
    const quat = integrateQuaternion(
      newBall.qx,
      newBall.qy,
      newBall.qz,
      newBall.qw,
      newBall.wx,
      newBall.wy,
      newBall.wz,
      stepDt
    );
    newBall.qx = quat.qx;
    newBall.qy = quat.qy;
    newBall.qz = quat.qz;
    newBall.qw = quat.qw;

    // Maintain backward-compatible Euler rotations for legacy shaders
    newBall.rotX += newBall.wx * stepDt;
    newBall.rotZ += newBall.wz * stepDt;

    // 2. Outer boundary collision
    const minBound = -halfSize + R;
    const maxBound = halfSize - R;

    if (newBall.x < minBound) {
      const impactSpeed = resolveVerticalWallImpact(newBall, 1, 0);
      if (impactSpeed > 0.2) {
        collisionEvents.push({ impactSpeed, x: newBall.x, z: newBall.z, isCorner: false });
      }
      newBall.x = minBound;
    } else if (newBall.x > maxBound) {
      const impactSpeed = resolveVerticalWallImpact(newBall, -1, 0);
      if (impactSpeed > 0.2) {
        collisionEvents.push({ impactSpeed, x: newBall.x, z: newBall.z, isCorner: false });
      }
      newBall.x = maxBound;
    }

    if (newBall.z < minBound) {
      const impactSpeed = resolveVerticalWallImpact(newBall, 0, 1);
      if (impactSpeed > 0.2) {
        collisionEvents.push({ impactSpeed, x: newBall.x, z: newBall.z, isCorner: false });
      }
      newBall.z = minBound;
    } else if (newBall.z > maxBound) {
      const impactSpeed = resolveVerticalWallImpact(newBall, 0, -1);
      if (impactSpeed > 0.2) {
        collisionEvents.push({ impactSpeed, x: newBall.x, z: newBall.z, isCorner: false });
      }
      newBall.z = maxBound;
    }

    // 3. Internal Maze Wall Collisions (with rounded beveled end-caps)
    for (const wall of level.walls) {
      const halfThick = wall.thickness / 2;
      const minDistance = R + halfThick;

      const { cx, cz, dist, nx, nz, t } = getClosestPointOnSegment(
        newBall.x,
        newBall.z,
        wall.x1,
        wall.z1,
        wall.x2,
        wall.z2
      );

      if (dist < minDistance) {
        // getClosestPointOnSegment has no normal at exact overlap. Choose a
        // stable normal from the wall axis, oriented against incoming motion,
        // so a high-speed ball cannot become stuck in a rail's centre line.
        let normalX = nx;
        let normalZ = nz;
        if (dist <= 0.000001) {
          const wallX = wall.x2 - wall.x1;
          const wallZ = wall.z2 - wall.z1;
          const wallLength = Math.hypot(wallX, wallZ);
          normalX = wallLength > 1e-8 ? -wallZ / wallLength : 1;
          normalZ = wallLength > 1e-8 ? wallX / wallLength : 0;
          if (newBall.vx * normalX + newBall.vz * normalZ > 0) {
            normalX = -normalX;
            normalZ = -normalZ;
          }
        }
        const penetration = minDistance - dist;
        newBall.x += normalX * penetration;
        newBall.z += normalZ * penetration;

        const impactSpeed = resolveVerticalWallImpact(newBall, normalX, normalZ);
        if (impactSpeed > 0) {
          const isCorner = t === 0 || t === 1;
          if (impactSpeed > 0.2) {
            collisionEvents.push({ impactSpeed, x: cx, z: cz, isCorner });
          }
        }
      }
    }

    // 4. Circular hole support geometry. A ball can ride a rim, then loses
    // support only once its centre passes the physically unsupported radius.
    // This deliberately replaces the former magnetic inward pull.
    let targetSurfaceY = 0;
    let rimSlope = 0;
    let rimDirX = 0;
    let rimDirZ = 0;
    for (const hole of level.holes) {
      const dx = newBall.x - hole.x;
      const dz = newBall.z - hole.z;
      const distToHole = Math.hypot(dx, dz);
      const unsupportedRadius = Math.max(0, hole.radius - R);

      if (distToHole <= unsupportedRadius + 0.008) {
        newBall.isFalling = true;
        fellInHole = hole;
        break;
      }
      if (distToHole < hole.radius && distToHole > unsupportedRadius) {
        const overhang = hole.radius - distToHole;
        const contactHeight = Math.sqrt(Math.max(0, R * R - overhang * overhang));
        targetSurfaceY = Math.min(targetSurfaceY, contactHeight - R);
        const slope = overhang / Math.max(0.08, contactHeight);
        if (slope > rimSlope) {
          rimSlope = slope;
          rimDirX = dx / Math.max(distToHole, 1e-8);
          rimDirZ = dz / Math.max(distToHole, 1e-8);
        }
      } else if (distToHole >= hole.radius && distToHole <= hole.radius + 0.10) {
        // The brass ring is a tiny physical bump, not a force field.
        const edgeFactor = 1 - (distToHole - hole.radius) / 0.10;
        targetSurfaceY = Math.max(targetSurfaceY, 0.016 * edgeFactor * edgeFactor);
      }
    }

    if (!newBall.isFalling) {
      // Gravity resolved along the real slope of the sphere--rim contact.
      if (rimSlope > 0) {
        const radialAcceleration = -normalAcceleration * rimSlope / (1 + rimSlope * rimSlope);
        newBall.vx += rimDirX * radialAcceleration * stepDt;
        newBall.vz += rimDirZ * radialAcceleration * stepDt;
      }
      newBall.y += (targetSurfaceY - newBall.y) * Math.min(1.0, stepDt * 45);
    }

    if (newBall.isFalling) break;

    // 5. Gem pickups
    for (const gem of level.gems) {
      if (!collectedGemIds.has(gem.id)) {
        const dx = newBall.x - gem.x;
        const dz = newBall.z - gem.z;
        const distToGem = Math.sqrt(dx * dx + dz * dz);
        if (distToGem < R + 0.45) {
          newlyCollectedGems.push(gem.id);
          collectedGemIds.add(gem.id);
        }
      }
    }

    // 6. Goal detection
    const goalDx = newBall.x - level.goal.x;
    const goalDz = newBall.z - level.goal.z;
    const distToGoal = Math.sqrt(goalDx * goalDx + goalDz * goalDz);
    if (distToGoal < level.goal.radius * 0.75) {
      reachedGoal = true;
    }
  }

  return {
    ball: newBall,
    collisionEvents,
    fellInHole,
    reachedGoal,
    collectedGems: newlyCollectedGems,
  };
}
