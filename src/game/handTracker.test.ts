import test from 'node:test';
import assert from 'node:assert/strict';
import { HandTracker } from './handTracker.ts';

const listeners = new Map<string, Set<(event: any) => void>>();
(globalThis as any).window = {
  addEventListener(type: string, cb: (event: any) => void) {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type)!.add(cb);
  },
  removeEventListener(type: string, cb: (event: any) => void) { listeners.get(type)?.delete(cb); },
};
(globalThis as any).document = {
  createElement: () => ({ width: 0, height: 0, getContext: () => ({}) }),
};
let nextId = 0;
(globalThis as any).requestAnimationFrame = () => ++nextId;
(globalThis as any).cancelAnimationFrame = () => {};

const point = (x: number, y = 0.5) => ({ x, y, confidence: 0.95 });
const makeTracker = () => new HandTracker({ onStateUpdate: () => {} });

test('hand identity is retained after crossing when MediaPipe handedness is available', () => {
  const tracker = makeTracker();
  try {
    (tracker as any).assignHandsContinuity([point(0.2), point(0.8)], ['Left', 'Right']);
    assert.ok(tracker.state.leftHand!.x < tracker.state.rightHand!.x);
    (tracker as any).assignHandsContinuity([point(0.8), point(0.2)], ['Left', 'Right']);
    assert.ok(tracker.state.leftHand!.x > tracker.state.rightHand!.x,
      'logical identity must not be reassigned merely by screen position');
  } finally { tracker.dispose(); }
});

test('losing either hand cannot retain a stale second hand', () => {
  const tracker = makeTracker();
  try {
    (tracker as any).assignHandsContinuity([point(0.2), point(0.8)], ['Left', 'Right']);
    tracker.state.rawTilt = { pitch: 0.2, roll: 0.2 };
    (tracker as any).assignHandsContinuity([point(0.25)], ['Left']);
    (tracker as any).updateTiltFromDetectedHands(0.015);
    assert.equal(tracker.state.hasRightHand, false);
    assert.equal(tracker.state.rightHand, null);
    assert.deepEqual(tracker.state.rawTilt, { pitch: 0, roll: 0 });
  } finally { tracker.dispose(); }
});

test('calibration requires two seconds of stable continuous hand tracking', () => {
  const tracker = makeTracker();
  try {
    tracker.startAutoCalibration();
    (tracker as any).assignHandsContinuity([point(0.2), point(0.8)], ['Left', 'Right']);
    (tracker as any).updateCalibration(1000);
    assert.equal(tracker.state.calibrationProgress, 0);
    (tracker as any).assignHandsContinuity([point(0.2, 0.7), point(0.8, 0.7)], ['Left', 'Right']);
    (tracker as any).updateCalibration(1500);
    assert.ok(tracker.state.calibrationProgress < 0.1, 'large movement resets hold duration');
    (tracker as any).assignHandsContinuity([], []);
    (tracker as any).updateCalibration(1800);
    assert.equal(tracker.state.calibrationProgress, 0, 'tracking interruption resets hold duration');
    // Simulate 31 frames over >2 seconds at stable pose
    (tracker as any).assignHandsContinuity([point(0.2, 0.5), point(0.8, 0.5)], ['Left', 'Right']);
    for (let i=0; i<=30; i++) (tracker as any).updateCalibration(2000+i*80);
    assert.equal(tracker.state.isCalibrating, false);
    assert.equal(tracker.state.calibrationProgress, 1);
  } finally { tracker.dispose(); }
});

test('stopping camera clears stale tilt and dispose removes registered keyboard listeners', () => {
  const prevCount = listeners.get('keydown')?.size || 0;
  const tracker = makeTracker();
  assert.equal(listeners.get('keydown')?.size, prevCount+1);
  tracker.state.rawTilt = { pitch: 0.2, roll: 0.1 };
  tracker.stopCamera();
  assert.deepEqual(tracker.state.rawTilt, { pitch: 0, roll: 0 });
  tracker.dispose();
  assert.equal(listeners.get('keydown')?.size, prevCount);
});

test('camera startup succeeds and stopping releases real media tracks', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  let stopped = false;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {
    mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => { stopped = true; } }] }) },
  } });
  const tracker = makeTracker();
  const video = { srcObject: null as any, play: async () => {}, readyState: 2, currentTime: 0 };
  try {
    assert.equal(await tracker.startCamera(video as unknown as HTMLVideoElement), true);
    assert.equal(tracker.state.isCameraActive, true);
    assert.equal(tracker.state.trackingLost, true);
    tracker.stopCamera();
    assert.equal(stopped, true);
    assert.equal(video.srcObject, null);
    assert.equal(tracker.state.trackingMode, 'mouse');
  } finally {
    tracker.dispose();
    if (descriptor) Object.defineProperty(globalThis, 'navigator', descriptor);
    else delete (globalThis as any).navigator;
  }
});
