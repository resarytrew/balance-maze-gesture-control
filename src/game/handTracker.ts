import type { HandPoint, HandTrackingState, TiltState } from './types.ts';
import { computeTiltFromHands } from './physics.ts';
import { clampBoardTilt, MAX_TILT_RAD } from './mechanics.ts';
import { fingerPinchRatio, PinchGestureGate } from './pinchGesture.ts';

export type TrackingMode = 'camera' | 'mouse' | 'keyboard';
export type SensitivityPreset = 'precision' | 'normal' | 'fast';
export type ControlProfile = 'virtual-board' | 'height-lever';

export interface HandTrackerCallbacks {
  onStateUpdate: (state: HandTrackingState) => void;
  /** A deliberate pinch on either hand; fires once until fingers open again. */
  onPinchGesture?: () => void;
  onError?: (err: Error) => void;
}

export class HandTracker {
  private videoEl: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private animFrameId: number | null = null;
  private offscreenCanvas: HTMLCanvasElement;
  private offscreenCtx: CanvasRenderingContext2D | null;

  public state: HandTrackingState = {
    hasLeftHand: false,
    hasRightHand: false,
    leftHand: null,
    rightHand: null,
    rawTilt: { pitch: 0, roll: 0 },
    smoothTilt: { pitch: 0, roll: 0 },
    calibration: {
      neutralLeftY: 0.5,
      neutralRightY: 0.5,
      neutralAvgY: 0.5,
      neutralDistX: 0.5,
      neutralDepthSize: 0,
    },
    sensitivity: 1.1,
    sensitivityPreset: 'normal',
    controlProfile: 'height-lever',
    engine: 'fallback',
    isCameraActive: false,
    trackingLost: false,
    isCalibrating: false,
    calibrationProgress: 0,
    trackingMode: 'camera',
  };

  private callbacks: HandTrackerCallbacks;
  private lastFrameData: Uint8ClampedArray | null = null;

  // Hand tracking temporal continuity (for crossing screen halves)
  private prevLeftPos: HandPoint | null = null;
  private prevRightPos: HandPoint | null = null;
  private lastHandsDetectedTime: number = 0;
  private lostHandGracePeriod = 250; // ms before showing tracking-loss warning

  // Auto-calibration state (2-second stability hold)
  private calibrationSamples: { leftY: number; rightY: number; avgY: number; distX: number; depth: number }[] = [];
  private calibrationStartTime: number = 0;
  private readonly calibrationHoldMs = 2000;
  private readonly pinchGate = new PinchGestureGate();
  private lastVideoTime = -1;
  private lastVideoFrameAt = 0;
  private handednessToSide = new Map<string, 'left' | 'right'>();
  private readonly onKeyDown = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd', 'ц', 'ф', 'ы', 'в'].includes(key)) {
      this.activeKeys.add(key);
    }
    if ((key === 'c' || key === 'с') && this.state.trackingMode === 'camera') this.startAutoCalibration();
  };
  private readonly onKeyUp = (e: KeyboardEvent) => this.activeKeys.delete(e.key.toLowerCase());
  private disposed = false;
  private cameraRequestId = 0;

  // Mouse / Virtual control state
  private mouseTilt: TiltState = { pitch: 0, roll: 0 };
  private keyTilt: TiltState = { pitch: 0, roll: 0 };
  private activeKeys = new Set<string>();

  // MediaPipe Vision Landmarker
  private mpLandmarker: any = null;
  private isMpLoading = false;

  // Throttling for UI updates (to prevent React 60Hz re-render thrashing)
  private lastUIUpdateTime = 0;

  constructor(callbacks: HandTrackerCallbacks) {
    this.callbacks = callbacks;
    this.offscreenCanvas = document.createElement('canvas');
    this.offscreenCanvas.width = 160;
    this.offscreenCanvas.height = 120;
    this.offscreenCtx = this.offscreenCanvas.getContext('2d', { willReadFrequently: true });

    this.setupKeyboardListeners();
    void this.tryInitMediaPipe();
    this.startTrackingLoop();
  }

  private async tryInitMediaPipe() {
    try {
      this.isMpLoading = true;
      const vision = await import('@mediapipe/tasks-vision');
      const wasmFileset = await vision.FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm'
      );

      // Try GPU delegate first, fallback to CPU delegate
      let landmarker = null;
      try {
        landmarker = await vision.HandLandmarker.createFromOptions(wasmFileset, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numHands: 2,
          minHandDetectionConfidence: 0.4,
          minHandPresenceConfidence: 0.4,
          minTrackingConfidence: 0.4,
        });
      } catch {
        // Fallback to CPU delegate
        landmarker = await vision.HandLandmarker.createFromOptions(wasmFileset, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          numHands: 2,
          minHandDetectionConfidence: 0.4,
          minHandPresenceConfidence: 0.4,
          minTrackingConfidence: 0.4,
        });
      }

      if (this.disposed) {
        landmarker?.close();
        return;
      }
      this.mpLandmarker = landmarker;
      this.state.engine = 'mediapipe';
    } catch {
      if (this.disposed) return;
      this.mpLandmarker = null;
      this.state.engine = 'fallback';
    } finally {
      this.isMpLoading = false;
    }
  }

  public async startCamera(videoElement: HTMLVideoElement): Promise<boolean> {
    this.stopCamera(false);
    const request = ++this.cameraRequestId;
    this.videoEl = videoElement;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      });
      if (this.disposed || request !== this.cameraRequestId) {
        stream.getTracks().forEach(track => track.stop());
        return false;
      }
      this.stream = stream;
      // If the depth-capable model failed, keep a usable two-dimensional control mode.
      if (!this.mpLandmarker && !this.isMpLoading && this.state.controlProfile === 'virtual-board') {
        this.state.controlProfile = 'height-lever';
      }
      videoElement.srcObject = stream;
      await videoElement.play();
      if (this.disposed || request !== this.cameraRequestId) {
        stream.getTracks().forEach(track => track.stop());
        videoElement.srcObject = null;
        return false;
      }
      this.state.isCameraActive = true;
      this.state.trackingMode = 'camera';
      this.state.trackingLost = true; // wait for both hands, never trust stale poses
      this.resetTracking();
      this.lastVideoTime = -1;
      this.lastVideoFrameAt = performance.now();
      this.startTrackingLoop();
      this.notifyState(true);
      return true;
    } catch (err: any) {
      if (request !== this.cameraRequestId || this.disposed) return false;
      this.stopCamera(false);
      this.state.trackingMode = 'mouse';
      this.callbacks.onError?.(err instanceof Error ? err : new Error(String(err)));
      this.startTrackingLoop();
      this.notifyState(true);
      return false;
    }
  }

  private resetTracking() {
    this.state.hasLeftHand = false;
    this.state.hasRightHand = false;
    this.state.leftHand = null;
    this.state.rightHand = null;
    this.state.rawTilt = { pitch: 0, roll: 0 };
    this.state.smoothTilt = { pitch: 0, roll: 0 };
    this.prevLeftPos = null;
    this.prevRightPos = null;
    this.lastFrameData = null;
    this.handednessToSide.clear();
    this.state.isCalibrating = false;
    this.state.calibrationProgress = 0;
    this.calibrationSamples = [];
    this.calibrationStartTime = 0;
    this.pinchGate.reset();
  }

  public stopCamera(notify = true) {
    ++this.cameraRequestId;
    this.stream?.getTracks().forEach(track => track.stop());
    this.stream = null;
    if (this.videoEl) this.videoEl.srcObject = null;
    this.videoEl = null;
    this.state.isCameraActive = false;
    this.state.trackingLost = false;
    this.resetTracking();
    if (this.state.trackingMode === 'camera') this.state.trackingMode = 'mouse';
    if (notify) this.notifyState(true);
  }

  public setTrackingMode(mode: TrackingMode, autoStopCamera = true) {
    if (mode !== 'camera' && autoStopCamera) this.stopCamera(false);
    // A camera mode with no live stream cannot silently reuse stale hand state.
    this.state.trackingMode = mode === 'camera' && !this.stream ? 'mouse' : mode;
    if (this.state.trackingMode !== 'camera') this.pinchGate.reset();
    this.state.rawTilt = { pitch: 0, roll: 0 };
    this.state.smoothTilt = { pitch: 0, roll: 0 };
    this.notifyState(true);
  }

  public setSensitivityPreset(preset: SensitivityPreset) {
    this.state.sensitivityPreset = preset;
    if (preset === 'precision') {
      this.state.sensitivity = 0.75;
    } else if (preset === 'normal') {
      this.state.sensitivity = 1.1;
    } else if (preset === 'fast') {
      this.state.sensitivity = 1.6;
    }
    this.notifyState();
  }

  public setControlProfile(profile: ControlProfile) {
    // Depth by apparent size needs MediaPipe landmarks, not pixel motion fallback.
    if (profile === 'virtual-board' && this.state.engine === 'fallback' && this.state.isCameraActive) return;
    if (this.state.controlProfile === profile) return;
    this.state.controlProfile = profile;
    this.state.rawTilt = { pitch: 0, roll: 0 };
    this.state.smoothTilt = { pitch: 0, roll: 0 };
    if (this.state.trackingMode === 'camera' && this.state.isCameraActive) this.startAutoCalibration();
    this.notifyState(true);
  }

  public startAutoCalibration() {
    this.state.isCalibrating = true;
    this.state.calibrationProgress = 0;
    this.calibrationSamples = [];
    this.calibrationStartTime = 0; // starts only after both hands are stable and visible
    this.notifyState();
  }

  public calibrateInstant() {
    if (this.state.hasLeftHand && this.state.hasRightHand && this.state.leftHand && this.state.rightHand) {
      this.state.calibration = {
        neutralLeftY: this.state.leftHand.y,
        neutralRightY: this.state.rightHand.y,
        neutralAvgY: (this.state.leftHand.y + this.state.rightHand.y) / 2,
        neutralDistX: Math.abs(this.state.rightHand.x - this.state.leftHand.x),
        neutralDepthSize: ((this.state.leftHand.apparentSize || 0) + (this.state.rightHand.apparentSize || 0)) / 2,
      };
    } else {
      this.state.calibration = {
        neutralLeftY: 0.5,
        neutralRightY: 0.5,
        neutralAvgY: 0.5,
        neutralDistX: 0.5,
        neutralDepthSize: 0,
      };
    }
    this.state.isCalibrating = false;
    this.state.calibrationProgress = 1.0;
    this.notifyState();
  }

  public setSensitivity(val: number) {
    this.state.sensitivity = Math.max(0.4, Math.min(2.5, val));
    this.notifyState();
  }

  public setMouseTilt(pitch: number, roll: number) {
    this.mouseTilt = clampBoardTilt({ pitch, roll });
  }

  private setupKeyboardListeners() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  private updateKeyboardTilt() {
    let p = 0;
    let r = 0;
    const maxTilt = MAX_TILT_RAD;

    if (this.activeKeys.has('arrowup') || this.activeKeys.has('w') || this.activeKeys.has('ц')) {
      p += maxTilt;
    }
    if (this.activeKeys.has('arrowdown') || this.activeKeys.has('s') || this.activeKeys.has('ы')) {
      p -= maxTilt;
    }
    if (this.activeKeys.has('arrowleft') || this.activeKeys.has('a') || this.activeKeys.has('ф')) {
      r -= maxTilt;
    }
    if (this.activeKeys.has('arrowright') || this.activeKeys.has('d') || this.activeKeys.has('в')) {
      r += maxTilt;
    }

    this.keyTilt = clampBoardTilt({ pitch: p, roll: r });
  }

  private notifyState(force = false) {
    const now = performance.now();
    // Throttle React state updates to 15-20Hz so 60fps WebGL is never bogged down
    if (force || now - this.lastUIUpdateTime > 65) {
      this.lastUIUpdateTime = now;
      this.callbacks.onStateUpdate({ ...this.state });
    }
  }

  private updateCalibration(now: number) {
    if (!this.state.isCalibrating) return;
    const left = this.state.leftHand;
    const right = this.state.rightHand;
    if (!this.state.hasLeftHand || !this.state.hasRightHand || !left || !right) {
      this.calibrationStartTime = 0;
      this.calibrationSamples = [];
      this.state.calibrationProgress = 0;
      return;
    }
    const sample = {
      leftY: left.y, rightY: right.y,
      avgY: (left.y + right.y) / 2,
      distX: Math.abs(right.x - left.x),
      depth: ((left.apparentSize || 0) + (right.apparentSize || 0)) / 2,
    };
    // Reject movement relative to initial hold pose (not just random jitter).
    const first = this.calibrationSamples[0];
    if (first && (
      Math.abs(sample.leftY - first.leftY) > 0.025 ||
      Math.abs(sample.rightY - first.rightY) > 0.025 ||
      Math.abs(sample.distX - first.distX) > 0.045 ||
      (sample.depth > 0 && first.depth > 0 && Math.abs(sample.depth / first.depth - 1) > 0.13)
    )) {
      this.calibrationStartTime = 0;
      this.calibrationSamples = [];
      this.state.calibrationProgress = 0;
    }
    if (this.calibrationStartTime === 0) this.calibrationStartTime = now;
    this.calibrationSamples.push(sample);
    this.state.calibrationProgress = Math.min(1, (now - this.calibrationStartTime) / this.calibrationHoldMs);
    if (this.state.calibrationProgress < 1 || this.calibrationSamples.length < 12) return;

    const n = this.calibrationSamples.length;
    const sum = this.calibrationSamples.reduce((acc, a) => ({
      leftY: acc.leftY + a.leftY, rightY: acc.rightY + a.rightY,
      avgY: acc.avgY + a.avgY, distX: acc.distX + a.distX, depth: acc.depth + a.depth,
    }), { leftY: 0, rightY: 0, avgY: 0, distX: 0, depth: 0 });
    this.state.calibration = {
      neutralLeftY: sum.leftY / n,
      neutralRightY: sum.rightY / n,
      neutralAvgY: sum.avgY / n,
      neutralDistX: sum.distX / n,
      neutralDepthSize: sum.depth / n,
    };
    this.state.isCalibrating = false;
    this.state.calibrationProgress = 1;
    this.state.rawTilt = { pitch: 0, roll: 0 };
  }

  private startTrackingLoop() {
    if (this.animFrameId !== null) cancelAnimationFrame(this.animFrameId);
    let previousTime = performance.now();
    const processFrame = (now: number) => {
      if (this.disposed) return;
      const dt = Math.min(0.1, Math.max(0, (now - previousTime) / 1000));
      previousTime = now;
      if (this.state.trackingMode === 'camera' && this.state.isCameraActive && this.videoEl) {
        if (this.videoEl.readyState >= 2 && this.videoEl.currentTime !== this.lastVideoTime) {
          this.lastVideoTime = this.videoEl.currentTime;
          this.lastVideoFrameAt = now;
          this.trackHandsFromVideo();
          this.updateCalibration(now);
          if (this.state.hasLeftHand && this.state.hasRightHand) {
            this.lastHandsDetectedTime = now;
            this.state.trackingLost = false;
          }
        } else if (now - this.lastVideoFrameAt > this.lostHandGracePeriod) {
          this.assignHandsContinuity([]);
          this.pinchGate.update([], now);
        }
        if (!this.state.hasLeftHand || !this.state.hasRightHand) {
          this.state.rawTilt = { pitch: 0, roll: 0 };
          if (now - this.lastHandsDetectedTime > this.lostHandGracePeriod) this.state.trackingLost = true;
          if (this.state.isCalibrating) this.updateCalibration(now);
        }
      } else if (this.state.trackingMode === 'keyboard') {
        this.updateKeyboardTilt();
        this.state.rawTilt = { ...this.keyTilt };
        const leftY = 0.5 - this.keyTilt.roll * 0.8 - this.keyTilt.pitch * 0.4;
        const rightY = 0.5 + this.keyTilt.roll * 0.8 - this.keyTilt.pitch * 0.4;
        this.state.leftHand = { x: 0.25, y: Math.max(0.1, Math.min(0.9, leftY)), confidence: 1 };
        this.state.rightHand = { x: 0.75, y: Math.max(0.1, Math.min(0.9, rightY)), confidence: 1 };
        this.state.hasLeftHand = this.state.hasRightHand = true;
        this.state.trackingLost = false;
        this.state.engine = 'synthetic';
      } else if (this.state.trackingMode === 'mouse') {
        this.state.rawTilt = { ...this.mouseTilt };
        const leftY = 0.5 - this.mouseTilt.roll * 0.8 - this.mouseTilt.pitch * 0.4;
        const rightY = 0.5 + this.mouseTilt.roll * 0.8 - this.mouseTilt.pitch * 0.4;
        this.state.leftHand = { x: 0.25, y: Math.max(0.1, Math.min(0.9, leftY)), confidence: 1 };
        this.state.rightHand = { x: 0.75, y: Math.max(0.1, Math.min(0.9, rightY)), confidence: 1 };
        this.state.hasLeftHand = this.state.hasRightHand = true;
        this.state.trackingLost = false;
        this.state.engine = 'synthetic';
      }
      // Time-based exponential filter behaves consistently at different refresh rates.
      const alpha = 1 - Math.exp(-22 * dt);
      this.state.smoothTilt.roll += (this.state.rawTilt.roll - this.state.smoothTilt.roll) * alpha;
      this.state.smoothTilt.pitch += (this.state.rawTilt.pitch - this.state.smoothTilt.pitch) * alpha;
      this.notifyState();
      this.animFrameId = requestAnimationFrame(processFrame);
    };
    this.animFrameId = requestAnimationFrame(processFrame);
  }

  /**
   * Tracks hands across the whole frame with temporal nearest-neighbor continuity.
   * Completely solves the crossing screen halves defect!
   */
  private trackHandsFromVideo() {
    if (!this.videoEl || !this.offscreenCtx) return;

    const deadzone =
      this.state.sensitivityPreset === 'precision'
        ? 0.025
        : this.state.sensitivityPreset === 'normal'
        ? 0.015
        : 0.008;

    // Primary: never mistake a temporary MediaPipe miss for a hardware failure.
    if (this.mpLandmarker) {
      this.state.engine = 'mediapipe';
      try {
        const results = this.mpLandmarker.detectForVideo(this.videoEl, performance.now());
        const pinchRatios: number[] = [];
        const points: HandPoint[] = (results.landmarks || []).map((marks: any) => {
          const videoWidth = this.videoEl?.videoWidth || 640;
          const videoHeight = this.videoEl?.videoHeight || 480;
          const scale = Math.max(videoWidth, videoHeight);
          const ratio = fingerPinchRatio(marks, videoWidth, videoHeight);
          if (ratio !== null) pinchRatios.push(ratio);
          const span = (a: number, b: number) => Math.hypot(
            (marks[a].x - marks[b].x) * videoWidth,
            (marks[a].y - marks[b].y) * videoHeight,
          ) / scale;
          return {
            x: 1 - (marks[0].x + marks[9].x) / 2,
            y: (marks[0].y + marks[9].y) / 2,
            apparentSize: 0.75 * span(0, 9) + 0.25 * span(5, 17),
            confidence: 1, // landmark existence, not a calibrated probability
          };
        });
        const labels: (string | null)[] = (results.handednesses || []).map(
          (categories: any[]) => categories?.[0]?.score >= 0.65 ? categories[0].categoryName : null
        );
        this.assignHandsContinuity(points, labels);
        this.updateTiltFromDetectedHands(deadzone);
        // Use only real finger landmarks. An optical fallback cannot report
        // fingertips. Keep the two-hand board control fully functional.
        const pinches = this.state.trackingMode === 'camera' &&
          this.state.isCameraActive && !this.state.isCalibrating &&
          this.state.hasLeftHand && this.state.hasRightHand
          ? pinchRatios : [];
        if (this.pinchGate.update(pinches, performance.now())) {
          this.callbacks.onPinchGesture?.();
        }
      } catch (err) {
        console.warn('MediaPipe frame detection failed:', err);
        this.assignHandsContinuity([]);
        this.pinchGate.update([], performance.now());
        this.state.rawTilt = { pitch: 0, roll: 0 };
      }
      return;
    }
    // Optical fallback cannot observe fingertips; never synthesize pinch events.
    this.pinchGate.update([], performance.now());
    // Optical fallback is used only when loading the hand model failed entirely.
    if (this.isMpLoading) {
      this.assignHandsContinuity([]);
      return;
    }

    // 2. High-speed Fallback: Adaptive Dual-Palm Skin/Motion Optical Tracker
    this.state.engine = 'fallback';
    const w = this.offscreenCanvas.width;
    const h = this.offscreenCanvas.height;

    this.offscreenCtx.drawImage(this.videoEl, 0, 0, w, h);
    const imgData = this.offscreenCtx.getImageData(0, 0, w, h);
    const pixels = imgData.data;

    let leftSumX = 0, leftSumY = 0, leftCount = 0;
    let rightSumX = 0, rightSumY = 0, rightCount = 0;

    // Temporal boundary: if previous hand positions exist, split around their midpoint!
    const midX = this.prevLeftPos && this.prevRightPos
      ? Math.floor(((this.prevLeftPos.x + this.prevRightPos.x) / 2) * w)
      : Math.floor(w / 2);

    for (let y = 12; y < h - 10; y += 2) {
      for (let x = 8; x < w - 8; x += 2) {
        const idx = (y * w + x) * 4;
        const r = pixels[idx];
        const g = pixels[idx + 1];
        const b = pixels[idx + 2];

        // Skin chromaticity check
        const isSkin =
          r > 85 && g > 45 && b > 25 &&
          r > g && r > b &&
          r - g > 12 &&
          Math.abs(r - g) < 130;

        let isMotion = false;
        if (this.lastFrameData) {
          const pr = this.lastFrameData[idx];
          const pg = this.lastFrameData[idx + 1];
          const pb = this.lastFrameData[idx + 2];
          isMotion = Math.abs(r - pr) + Math.abs(g - pg) + Math.abs(b - pb) > 35;
        }

        const mirroredX = w - 1 - x;

        if (isSkin || isMotion) {
          const weight = isSkin && isMotion ? 2.5 : 1.0;
          if (mirroredX < midX) {
            leftSumX += mirroredX * weight;
            leftSumY += y * weight;
            leftCount += weight;
          } else {
            rightSumX += mirroredX * weight;
            rightSumY += y * weight;
            rightCount += weight;
          }
        }
      }
    }

    this.lastFrameData = new Uint8ClampedArray(pixels);

    const minCount = 38;
    const candidates: HandPoint[] = [];

    if (leftCount > minCount) {
      candidates.push({
        x: leftSumX / leftCount / w,
        y: leftSumY / leftCount / h,
        confidence: Math.min(1.0, leftCount / 180),
      });
    }

    if (rightCount > minCount) {
      candidates.push({
        x: rightSumX / rightCount / w,
        y: rightSumY / rightCount / h,
        confidence: Math.min(1.0, rightCount / 180),
      });
    }

    this.assignHandsContinuity(candidates);

    if (this.state.hasLeftHand && this.state.hasRightHand) {
      this.state.rawTilt = computeTiltFromHands(
        this.state.leftHand,
        this.state.rightHand,
        this.state.calibration,
        this.state.sensitivity,
        this.state.controlProfile,
        deadzone
      );
    }
  }

  private updateTiltFromDetectedHands(deadzone: number) {
    if (!this.state.hasLeftHand || !this.state.hasRightHand) {
      this.state.rawTilt = { pitch: 0, roll: 0 };
      return;
    }
    this.state.rawTilt = computeTiltFromHands(
      this.state.leftHand, this.state.rightHand,
      this.state.calibration, this.state.sensitivity, this.state.controlProfile, deadzone
    );
  }

  /** Preserve hand identity through crossings using model labels, then trajectory continuity. */
  private assignHandsContinuity(points: HandPoint[], labels: (string | null)[] = []) {
    if (points.length === 0) {
      this.state.hasLeftHand = this.state.hasRightHand = false;
      this.state.leftHand = this.state.rightHand = null;
      return;
    }
    if (points.length >= 2) {
      // Learn mapping between MediaPipe's handedness labels and mirrored preview sides.
      // MediaPipe documentation assumes selfie input; this is an unmirrored camera frame.
      if (labels[0] && labels[1] && labels[0] !== labels[1] &&
          !this.handednessToSide.size && Math.abs(points[0].x - points[1].x) >= 0.12) {
        const idxLeft = points[0].x < points[1].x ? 0 : 1;
        this.handednessToSide.set(labels[idxLeft]!, 'left');
        this.handednessToSide.set(labels[1 - idxLeft]!, 'right');
      }
      let li = -1, ri = -1;
      if (labels.length >= 2 && labels[0] && labels[1]) {
        li = labels.findIndex(label => this.handednessToSide.get(label!) === 'left');
        ri = labels.findIndex(label => this.handednessToSide.get(label!) === 'right');
      }
      if (li < 0 || ri < 0 || li === ri) {
        // Minimize total motion: left->first/right->second versus swapped assignment.
        if (this.prevLeftPos && this.prevRightPos) {
          const d = (a: HandPoint, b: HandPoint) => Math.hypot(a.x - b.x, a.y - b.y);
          const direct = d(points[0], this.prevLeftPos) + d(points[1], this.prevRightPos);
          const swapped = d(points[1], this.prevLeftPos) + d(points[0], this.prevRightPos);
          li = direct <= swapped ? 0 : 1;
        } else li = points[0].x < points[1].x ? 0 : 1;
        ri = 1 - li;
      }
      this.smoothSetHand('left', points[li]);
      this.smoothSetHand('right', points[ri]);
      this.state.hasLeftHand = this.state.hasRightHand = true;
      return;
    }
    const pt = points[0];
    let side: 'left' | 'right' | undefined = labels[0] ? this.handednessToSide.get(labels[0]) : undefined;
    if (!side) {
      const dl = this.prevLeftPos ? Math.hypot(pt.x - this.prevLeftPos.x, pt.y - this.prevLeftPos.y) : Infinity;
      const dr = this.prevRightPos ? Math.hypot(pt.x - this.prevRightPos.x, pt.y - this.prevRightPos.y) : Infinity;
      side = Number.isFinite(Math.min(dl, dr)) ? (dl < dr ? 'left' : 'right') : (pt.x < 0.5 ? 'left' : 'right');
    }
    this.smoothSetHand(side, pt);
    this.state.hasLeftHand = side === 'left';
    this.state.hasRightHand = side === 'right';
    if (side === 'left') this.state.rightHand = null;
    else this.state.leftHand = null;
  }

  private smoothSetHand(which: 'left' | 'right', target: HandPoint) {
    const alpha = 0.60;
    const current = which === 'left' ? this.state.leftHand : this.state.rightHand;
    const result = current ? {
      x: current.x + (target.x - current.x) * alpha,
      y: current.y + (target.y - current.y) * alpha,
      confidence: target.confidence,
      apparentSize: target.apparentSize === undefined ? undefined :
        (current.apparentSize ?? target.apparentSize) + (target.apparentSize - (current.apparentSize ?? target.apparentSize)) * alpha,
    } : { ...target };
    if (which === 'left') {
      this.state.leftHand = result;
      this.prevLeftPos = { ...result };
    } else {
      this.state.rightHand = result;
      this.prevRightPos = { ...result };
    }
  }

  public dispose() {
    this.disposed = true;
    if (this.animFrameId !== null) cancelAnimationFrame(this.animFrameId);
    this.animFrameId = null;
    this.stopCamera(false);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.mpLandmarker?.close();
    this.mpLandmarker = null;
    this.activeKeys.clear();
  }
}
