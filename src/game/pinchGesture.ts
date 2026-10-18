/**
 * Detects a deliberate thumb-index pinch in either detected hand.
 * Input ratios are pixel distances between landmarks 4 and 8, divided by
 * that hand's palm size. This stays stable as the hand moves in depth.
 *
 * No camera / browser dependency: deterministic enough for regression tests.
 */
export const PINCH_ENTER_RATIO = 0.38;
export const PINCH_RELEASE_RATIO = 0.62;
export const PINCH_HOLD_MS = 200;
export const PINCH_RELEASE_MS = 140;

export class PinchGestureGate {
  private startedAt: number | null = null;
  private releaseStartedAt: number | null = null;
  private latched = false;

  /** Returns true only once per intentional pinch, after a stable hold. */
  update(ratios: readonly number[], nowMs: number): boolean {
    const valid = ratios.filter(value => Number.isFinite(value) && value >= 0);
    if (this.latched) {
      // Tracking loss must never count as a release. To repeat a gesture,
      // an actually observed open hand is required.
      if (valid.length > 0 && valid.every(ratio => ratio >= PINCH_RELEASE_RATIO)) {
        if (this.releaseStartedAt === null) this.releaseStartedAt = nowMs;
        if (nowMs - this.releaseStartedAt >= PINCH_RELEASE_MS) {
          this.latched = false;
          this.startedAt = null;
          this.releaseStartedAt = null;
        }
      } else {
        this.releaseStartedAt = null;
      }
      return false;
    }

    if (valid.some(ratio => ratio <= PINCH_ENTER_RATIO)) {
      if (this.startedAt === null) this.startedAt = nowMs;
      if (nowMs - this.startedAt >= PINCH_HOLD_MS) {
        this.startedAt = null;
        this.latched = true;
        return true;
      }
    } else {
      this.startedAt = null;
    }
    return false;
  }

  reset() {
    this.startedAt = null;
    this.releaseStartedAt = null;
    this.latched = false;
  }
}

/** MediaPipe HandLandmarker: fingertips 4 and 8, palm spans 0-9 and 5-17. */
export function fingerPinchRatio(
  landmarks: readonly { x: number; y: number }[],
  imageWidth: number,
  imageHeight: number,
): number | null {
  if (landmarks.length < 21 || !(imageWidth > 0) || !(imageHeight > 0)) return null;
  const distance = (a: number, b: number) => {
    const pa = landmarks[a];
    const pb = landmarks[b];
    if (!pa || !pb || ![pa.x, pa.y, pb.x, pb.y].every(Number.isFinite)) return NaN;
    return Math.hypot((pa.x - pb.x) * imageWidth, (pa.y - pb.y) * imageHeight);
  };
  const palm = Math.max(distance(0, 9), distance(5, 17));
  const tips = distance(4, 8);
  if (!Number.isFinite(palm) || !Number.isFinite(tips) || palm < Math.min(imageWidth, imageHeight) * 0.025) return null;
  return tips / palm;
}
