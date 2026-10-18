import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PinchGestureGate,
  fingerPinchRatio,
  PINCH_ENTER_RATIO,
  PINCH_HOLD_MS,
  PINCH_RELEASE_MS,
} from './pinchGesture.ts';

test('pinch activates on either hand only after a stable hold', () => {
  const g = new PinchGestureGate();
  assert.equal(g.update([0.2, 1.0], 0), false);
  assert.equal(g.update([0.22, 1.0], PINCH_HOLD_MS - 1), false);
  assert.equal(g.update([0.25, 0.98], PINCH_HOLD_MS), true);
  assert.equal(g.update([0.24, 0.22], PINCH_HOLD_MS + 300), false);
});

test('brief motion and unsteady pinches do not trigger', () => {
  const g = new PinchGestureGate();
  assert.equal(g.update([0.2, 1], 0), false);
  assert.equal(g.update([0.89, 1], PINCH_HOLD_MS / 2), false);
  assert.equal(g.update([1, 0.2], PINCH_HOLD_MS), false);
  assert.equal(g.update([0.9, 0.2], PINCH_HOLD_MS + PINCH_HOLD_MS), true);
});

test('pinch cannot retrigger until both hands have actually opened', () => {
  const g = new PinchGestureGate();
  assert.equal(g.update([0.1, 0.9], 0), false);
  assert.equal(g.update([0.1, 0.9], PINCH_HOLD_MS), true);
  assert.equal(g.update([], 500), false);
  assert.equal(g.update([0.2, 0.9], 800), false);
  assert.equal(g.update([0.9, 0.9], 850), false);
  assert.equal(g.update([0.9, 0.9], 850 + PINCH_RELEASE_MS), false);
  assert.equal(g.update([0.9, 0.1], 1000), false);
  assert.equal(g.update([0.9, 0.1], 1000 + PINCH_HOLD_MS), true);
});

test('hand-tracking loss does not count as opening the fingers', () => {
  const g = new PinchGestureGate();
  g.update([0.2,0.9], 0);
  assert.equal(g.update([0.2,0.9], 220), true);
  assert.equal(g.update([], 1000), false);
  assert.equal(g.update([0.2,0.9], 1020), false);
  g.reset();
  assert.equal(g.update([0.2,0.9], 1100), false);
  assert.equal(g.update([0.2,0.9], 1320), true);
});

test('pinch ratio uses image pixels and palm size instead of camera depth', () => {
  const hand = Array.from({length:21}, () => ({x:0.4,y:0.4}));
  hand[0] = {x:0.3,y:0.62};
  hand[9] = {x:0.42,y:0.33};
  hand[5] = {x:0.34,y:0.45};
  hand[17] = {x:0.55,y:0.46};
  hand[4] = {x:0.44,y:0.22};
  hand[8] = {x:0.445,y:0.224};
  const close = fingerPinchRatio(hand, 640, 480);
  assert.ok(close !== null && close < PINCH_ENTER_RATIO);
  hand[8] = {x:0.62,y:0.20};
  const open = fingerPinchRatio(hand, 640,480);
  assert.ok(open !== null && open > .62);
  assert.equal(fingerPinchRatio([], 640, 480), null);
  assert.equal(fingerPinchRatio(hand, 0, 480), null);
});

test('invalid or missing ratios never invent a pinch', () => {
  const g = new PinchGestureGate();
  assert.equal(g.update([NaN, Infinity], 0), false);
  assert.equal(g.update([-1], 999), false);
  assert.equal(g.update([], 1999), false);
});
