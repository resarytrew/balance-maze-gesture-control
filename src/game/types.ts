export interface Vector2D {
  x: number;
  y: number;
}

export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface Wall {
  id: string;
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  thickness: number;
}

export interface Hole {
  id: string;
  x: number;
  z: number;
  radius: number;
}

export interface Gem {
  id: string;
  x: number;
  z: number;
  collected: boolean;
}

export interface Goal {
  x: number;
  z: number;
  radius: number;
}

export interface BallState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  radius: number;
  // Angular velocity vector (rad/s)
  wx: number;
  wy: number;
  wz: number;
  // True 3D orientation quaternion
  qx: number;
  qy: number;
  qz: number;
  qw: number;
  rotX: number;
  rotZ: number;
  isFalling: boolean;
  fallProgress: number; // 0 to 1
  slip: number; // 0 (pure rolling) to 1 (pure sliding)
  holeVortexAngle: number;
}

export interface TiltState {
  pitch: number; // tilt around X axis (forward/backward) in radians
  roll: number;  // tilt around Z axis (left/right) in radians
}

export interface HandPoint {
  x: number; // 0 to 1 normalized
  y: number; // 0 to 1 normalized (0 top, 1 bottom)
  confidence: number;
  // Apparent palm size in the video image, a perspective depth proxy (MediaPipe only).
  apparentSize?: number;
}

export interface HandTrackingState {
  hasLeftHand: boolean;
  hasRightHand: boolean;
  leftHand: HandPoint | null;
  rightHand: HandPoint | null;
  rawTilt: TiltState;
  smoothTilt: TiltState;
  calibration: {
    neutralLeftY: number;
    neutralRightY: number;
    neutralAvgY: number;
    neutralDistX: number;
    neutralDepthSize?: number;
  };
  sensitivity: number;
  sensitivityPreset: 'precision' | 'normal' | 'fast';
  controlProfile: 'virtual-board' | 'height-lever';
  engine: 'mediapipe' | 'fallback' | 'synthetic';
  isCameraActive: boolean;
  trackingLost: boolean;
  isCalibrating: boolean;
  calibrationProgress: number; // 0 to 1
  trackingMode: 'camera' | 'mouse' | 'keyboard';
}

export interface LevelConfig {
  id: number;
  version?: number;
  name: string;
  difficulty: 'easy' | 'medium' | 'hard' | 'expert';
  description: string;
  boardSize: number; // e.g. 20 (from -10 to +10)
  startPos: { x: number; z: number };
  goal: Goal;
  holes: Hole[];
  gems: Gem[];
  walls: Wall[];
}

export type GameStatus = 'ready' | 'playing' | 'falling' | 'won' | 'fallen' | 'paused';
