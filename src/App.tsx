import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { BallState, GameStatus, HandTrackingState, LevelConfig, TiltState } from './game/types.ts';
import { BALL_RADIUS, stepPhysics, stepBoardTiltDynamics } from './game/physics.ts';
import { clampBoardTilt, nextHoleState } from './game/mechanics.ts';
import { generateRandomMaze, LEVELS } from './game/levels.ts';
import { HandTracker } from './game/handTracker.ts';
import type { TrackingMode, SensitivityPreset, ControlProfile } from './game/handTracker.ts';
import { soundEngine } from './game/audio.ts';
import { ThreeLabyrinth } from './components/ThreeLabyrinth.tsx';
import { WebcamOverlay } from './components/WebcamOverlay.tsx';
import { HUD } from './components/HUD.tsx';
import { Maximize2, Minimize2 } from 'lucide-react';
import { COSMIC_MISSIONS, chapterIndex, createMissionState, stepMission, activateStasis, STASIS_TIME_SCALE, type MissionState } from './game/mission.ts';

export default function App() {
  const [levelIndex, setLevelIndex] = useState(0);
  const [customLevel, setCustomLevel] = useState<LevelConfig | null>(null);
  const [missionMode, setMissionMode] = useState(false);
  const [missionUI, setMissionUI] = useState<MissionState>(() => createMissionState());
  const [completedChapters, setCompletedChapters] = useState<number[]>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('balance-maze-cosmic-completed') || '[]');
      return Array.isArray(stored) ? stored.filter((n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0 && (n as number) < COSMIC_MISSIONS.length) : [];
    } catch { return []; }
  });
  useEffect(() => {
    try { localStorage.setItem('balance-maze-cosmic-completed', JSON.stringify(completedChapters)); }
    catch { /* local storage may be disabled */ }
  }, [completedChapters]);

  const currentLevel = customLevel || LEVELS[levelIndex];

  const createInitialBall = (lvl: LevelConfig): BallState => ({
    x: lvl.startPos.x,
    y: 0,
    z: lvl.startPos.z,
    vx: 0,
    vy: 0,
    vz: 0,
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
  });

  const [ball, setBall] = useState<BallState>(() => createInitialBall(currentLevel));
  const [gameStatus, setGameStatus] = useState<GameStatus>('playing');
  const [elapsedTime, setElapsedTime] = useState(0);
  const [bestTimes, setBestTimes] = useState<Record<number, number>>(() => {
    try { return JSON.parse(localStorage.getItem('balance-maze-best-times') || '{}'); }
    catch { return {}; }
  });
  useEffect(() => {
    try { localStorage.setItem('balance-maze-best-times', JSON.stringify(bestTimes)); }
    catch { /* private browsing / storage disabled */ }
  }, [bestTimes]);
  const [collectedGems, setCollectedGems] = useState<Set<string>>(new Set());
  const [isMuted, setIsMuted] = useState(false);
  const [presentationMode, setPresentationMode] = useState(false);
  const [cosmicEvent, setCosmicEvent] = useState<{ id: number; text: string } | null>(null);
  const [impactSparks, setImpactSparks] = useState<{
    x: number;
    z: number;
    intensity: number;
    key: number;
  } | null>(null);

  // Hand tracking state
  const [handState, setHandState] = useState<HandTrackingState>({
    hasLeftHand: false,
    hasRightHand: false,
    leftHand: null,
    rightHand: null,
    rawTilt: { pitch: 0, roll: 0 },
    smoothTilt: { pitch: 0, roll: 0 },
    calibration: { neutralLeftY: 0.5, neutralRightY: 0.5, neutralAvgY: 0.5, neutralDistX: 0.5 },
    sensitivity: 1.1,
    sensitivityPreset: 'normal',
    controlProfile: 'virtual-board',
    engine: 'fallback',
    isCameraActive: false,
    trackingLost: false,
    isCalibrating: false,
    calibrationProgress: 0,
    trackingMode: 'camera',
  });

  const trackerRef = useRef<HandTracker | null>(null);

  // Refs for animation loop
  const ballRef = useRef<BallState>(ball);
  const currentLevelRef = useRef<LevelConfig>(currentLevel);
  currentLevelRef.current = currentLevel;
  const gameStatusRef = useRef<GameStatus>(gameStatus);
  gameStatusRef.current = gameStatus;
  // Single authoritative physical tilt shared with the Three.js renderer.
  const tiltRef = useRef<TiltState>({ pitch: 0, roll: 0 });
  const tiltVelocityRef = useRef<TiltState>({ pitch: 0, roll: 0 });
  const missionModeRef = useRef(false);
  const missionRef = useRef<MissionState>(createMissionState());
  const collectedGemsRef = useRef<Set<string>>(collectedGems);
  collectedGemsRef.current = collectedGems;
  const elapsedTimeRef = useRef(0);

  // Initialize tracker
  useEffect(() => {
    const tracker = new HandTracker({
      onStateUpdate: (updatedState) => {
        setHandState({ ...updatedState });
      },
      onPinchGesture: () => activateMissionPower(),
      onError: (err) => {
        console.warn('Camera error:', err);
      },
    });

    trackerRef.current = tracker;

    return () => {
      tracker.dispose();
      trackerRef.current = null;
    };
  }, []);

  // Keyboard hotkeys for R (restart)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R' || e.key === 'к' || e.key === 'К') {
        restartLevel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // P toggles showcase mode; Escape returns to full controls.
  useEffect(() => {
    const onPresentationKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'p' && !e.repeat) setPresentationMode(prev => !prev);
      if (e.key === 'Escape') setPresentationMode(false);
    };
    window.addEventListener('keydown', onPresentationKey);
    return () => window.removeEventListener('keydown', onPresentationKey);
  }, []);

  // Restart current level
  const restartLevel = useCallback(() => {
    const resetBall = createInitialBall(currentLevelRef.current);
    ballRef.current = resetBall;
    setBall(resetBall);
    collectedGemsRef.current = new Set();
    setCollectedGems(new Set());
    elapsedTimeRef.current = 0;
    setElapsedTime(0);
    gameStatusRef.current = 'playing';
    tiltRef.current = { pitch: 0, roll: 0 };
    tiltVelocityRef.current = { pitch: 0, roll: 0 };
    missionRef.current = createMissionState();
    setMissionUI(missionRef.current);
    setGameStatus('playing');
  }, []);

  // Select level
  const handleSelectLevel = useCallback((index: number) => {
    setCustomLevel(null);
    setMissionMode(false);
    missionModeRef.current = false;
    setLevelIndex(index);
    const lvl = LEVELS[index];
    currentLevelRef.current = lvl;
    const resetBall = createInitialBall(lvl);
    ballRef.current = resetBall;
    setBall(resetBall);
    collectedGemsRef.current = new Set();
    setCollectedGems(new Set());
    elapsedTimeRef.current = 0;
    setElapsedTime(0);
    gameStatusRef.current = 'playing';
    tiltRef.current = { pitch: 0, roll: 0 };
    tiltVelocityRef.current = { pitch: 0, roll: 0 };
    missionRef.current = createMissionState();
    setMissionUI(missionRef.current);
    setGameStatus('playing');
  }, []);

  // Next level
  const handleNextLevel = useCallback(() => {
    setCustomLevel(null);
    setMissionMode(false);
    missionModeRef.current = false;
    const nextIdx = (levelIndex + 1) % LEVELS.length;
    setLevelIndex(nextIdx);
    const lvl = LEVELS[nextIdx];
    currentLevelRef.current = lvl;
    const resetBall = createInitialBall(lvl);
    ballRef.current = resetBall;
    setBall(resetBall);
    collectedGemsRef.current = new Set();
    setCollectedGems(new Set());
    elapsedTimeRef.current = 0;
    setElapsedTime(0);
    gameStatusRef.current = 'playing';
    tiltRef.current = { pitch: 0, roll: 0 };
    tiltVelocityRef.current = { pitch: 0, roll: 0 };
    missionRef.current = createMissionState();
    setMissionUI(missionRef.current);
    setGameStatus('playing');
  }, [levelIndex]);

  // Procedural random maze
  const handleStartRandomLevel = useCallback(() => {
    const randLevel = generateRandomMaze(Date.now());
    setMissionMode(false);
    missionModeRef.current = false;
    setCustomLevel(randLevel);
    currentLevelRef.current = randLevel;
    const resetBall = createInitialBall(randLevel);
    ballRef.current = resetBall;
    setBall(resetBall);
    collectedGemsRef.current = new Set();
    setCollectedGems(new Set());
    elapsedTimeRef.current = 0;
    setElapsedTime(0);
    gameStatusRef.current = 'playing';
    tiltRef.current = { pitch: 0, roll: 0 };
    tiltVelocityRef.current = { pitch: 0, roll: 0 };
    missionRef.current = createMissionState();
    setMissionUI(missionRef.current);
    setGameStatus('playing');
  }, []);

  const startCosmicMission = useCallback((chapter = 0) => {
    const level = COSMIC_MISSIONS[Math.max(0, Math.min(chapter, COSMIC_MISSIONS.length - 1))];
    setCustomLevel(level);
    currentLevelRef.current = level;
    setMissionMode(true);
    missionModeRef.current = true;
    missionRef.current = createMissionState();
    setMissionUI(missionRef.current);
    const initial = createInitialBall(level);
    ballRef.current = initial;
    setBall(initial);
    collectedGemsRef.current = new Set();
    setCollectedGems(new Set());
    elapsedTimeRef.current = 0;
    setElapsedTime(0);
    tiltRef.current = { pitch: 0, roll: 0 };
    tiltVelocityRef.current = { pitch: 0, roll: 0 };
    gameStatusRef.current = 'playing';
    setGameStatus('playing');
  }, []);

  const activateMissionPower = useCallback(() => {
    if (!missionModeRef.current || gameStatusRef.current !== 'playing') return;
    const next = activateStasis(missionRef.current);
    if (next === missionRef.current) return;
    missionRef.current = next;
    setMissionUI(next);
    setCosmicEvent({ id: Date.now(), text: '⏳ ВРЕМЯ ЗАМЕДЛЕНО!' });
    soundEngine.playGemCollect();
  }, []);

  // Press space to trigger the special ability in any control mode.
  useEffect(() => {
    const onSpace = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.code !== 'Space' || event.repeat ||
          target?.closest('button,input,textarea,[contenteditable=true]')) return;
      if (!missionModeRef.current) return;
      event.preventDefault();
      activateMissionPower();
    };
    window.addEventListener('keydown', onSpace);
    return () => window.removeEventListener('keydown', onSpace);
  }, [activateMissionPower]);

  const advanceLevel = useCallback(() => {
    if (!missionModeRef.current) {
      handleNextLevel();
      return;
    }
    const chapter = chapterIndex(currentLevelRef.current);
    if (chapter >= 0 && chapter + 1 < COSMIC_MISSIONS.length) {
      startCosmicMission(chapter + 1);
    } else {
      // Finished the campaign: return to the classic toy, preserving badges.
      handleSelectLevel(0);
    }
  }, [handleNextLevel, handleSelectLevel, startCosmicMission]);

  // Toggle audio mute
  const handleToggleSound = useCallback(() => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    soundEngine.setMuted(nextMuted);
  }, [isMuted]);

  // Deterministic fixed-step simulation (120 Hz) independent of React UI re-renders.
  useEffect(() => {
    let animId = 0;
    let previous = performance.now();
    let accumulator = 0;
    let lastHudUpdate = 0;
    const FIXED_DT = 1 / 120;
    const loop = (now: number) => {
      animId = requestAnimationFrame(loop);
      const delta = Math.min((now - previous) / 1000, 0.05);
      previous = now;
      const tracker = trackerRef.current;
      const cameraNeedsBothHands = !!tracker && tracker.state.trackingMode === 'camera'
        && tracker.state.isCameraActive;
      const lostHands = cameraNeedsBothHands &&
        (!tracker!.state.hasLeftHand || !tracker!.state.hasRightHand || tracker!.state.trackingLost || tracker!.state.isCalibrating);
      const status = gameStatusRef.current;
      if (status !== 'playing' && status !== 'falling') {
        accumulator = 0;
        return;
      }

      // Stop the ball AND clock immediately if hands disappear. Keep animating board
      // toward horizontal while paused; don't inject stale target coordinates.
      if (lostHands && status === 'playing') {
        accumulator = 0;
        const alpha = 1 - Math.exp(-14 * delta);
        tiltRef.current.pitch += (0 - tiltRef.current.pitch) * alpha;
        tiltRef.current.roll += (0 - tiltRef.current.roll) * alpha;
        tiltVelocityRef.current = { pitch: 0, roll: 0 };
        return;
      }
      accumulator += delta;
      let steps = 0;
      while (accumulator >= FIXED_DT && steps < 7) {
        accumulator -= FIXED_DT;
        steps++;
        const target = clampBoardTilt(tracker?.state.smoothTilt || { pitch: 0, roll: 0 });
        const dynamics = stepBoardTiltDynamics(tiltRef.current, tiltVelocityRef.current, target, FIXED_DT);
        tiltRef.current = dynamics.tilt;
        tiltVelocityRef.current = dynamics.angularVelocity;
        if (gameStatusRef.current === 'playing') elapsedTimeRef.current += FIXED_DT;
        // Time dilation is an intentional adventure power, not a tweak to
        // physical friction, wall collisions or the contact solver.
        const simulationDt = missionModeRef.current && missionRef.current.stasisRemaining > 0
          ? FIXED_DT * STASIS_TIME_SCALE
          : FIXED_DT;
        const step = stepPhysics(
          ballRef.current, tiltRef.current, currentLevelRef.current, collectedGemsRef.current, simulationDt
        );
        ballRef.current = step.ball;
        if (missionModeRef.current && !step.ball.isFalling) {
          const event = stepMission(missionRef.current, ballRef.current, FIXED_DT, currentLevelRef.current);
          ballRef.current = event.ball;
          missionRef.current = event.state;
          if (event.changed) {
            setMissionUI(event.state);
            if (event.teleported || event.collectedBeacon) {
              soundEngine.playGemCollect();
              setCosmicEvent({
                id: now + steps,
                text: event.teleported ? '✨ ГИПЕРПРЫЖОК!' : '🌟 МАЯК СПАСЁН! +1 ЗАРЯД',
              });
            }
          }
        }
        if (step.collisionEvents.length) {
          const impact = step.collisionEvents.reduce((best, item) => item.impactSpeed > best.impactSpeed ? item : best);
          soundEngine.playWallThud(impact.impactSpeed, impact.isCorner);
          setImpactSparks({ x: impact.x, z: impact.z, intensity: impact.impactSpeed, key: now + steps });
        }
        if (step.collectedGems.length) {
          soundEngine.playGemCollect();
          setCollectedGems(new Set(collectedGemsRef.current));
        }
        const holeState = nextHoleState(gameStatusRef.current, step.ball.isFalling, step.ball.fallProgress);
        if (holeState !== gameStatusRef.current) {
          if (holeState === 'falling') soundEngine.playHoleDrop();
          gameStatusRef.current = holeState;
          setGameStatus(holeState);
          if (holeState === 'fallen') break;
        }
        if (step.reachedGoal && gameStatusRef.current === 'playing' && (!missionModeRef.current || missionRef.current.beacons >= currentLevelRef.current.gems.length)) {
          gameStatusRef.current = 'won';
          if (missionModeRef.current) setCosmicEvent({ id: now + steps, text: '🚀 МИССИЯ ВЫПОЛНЕНА!' });
          soundEngine.playWinFanfare();
          setGameStatus('won');
          const lvlId = currentLevelRef.current.id;
          if (missionModeRef.current) {
            const chapter = chapterIndex(currentLevelRef.current);
            if (chapter >= 0) setCompletedChapters(prev => prev.includes(chapter) ? prev : [...prev, chapter]);
          }
          if (lvlId !== 99 && lvlId < 100) { // random and story missions have separate records
            const finalTime = elapsedTimeRef.current;
            setBestTimes(prev => {
              const best = prev[lvlId];
              return !best || finalTime < best ? { ...prev, [lvlId]: finalTime } : prev;
            });
          }
          break;
        }
      }
      if (steps === 7) accumulator = 0; // avoid spiral of death on very slow devices
      if (now - lastHudUpdate > 100 || gameStatusRef.current !== status) {
        lastHudUpdate = now;
        setElapsedTime(elapsedTimeRef.current);
        setBall(ballRef.current); // only for HUD; Three.js reads ballRef every render
        if (missionModeRef.current && missionRef.current.stasisRemaining > 0) {
          setMissionUI({ ...missionRef.current });
        }
      }
    };
    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, []);

  // Hand tracker actions
  const handleStartCamera = useCallback(async (video: HTMLVideoElement) => {
    if (trackerRef.current) {
      soundEngine.resume();
      return await trackerRef.current.startCamera(video);
    }
    return false;
  }, []);

  const handleStopCamera = useCallback(() => {
    trackerRef.current?.stopCamera();
  }, []);

  const handleStartAutoCalibration = useCallback(() => {
    trackerRef.current?.startAutoCalibration();
  }, []);

  const handleSetSensitivityPreset = useCallback((preset: SensitivityPreset) => {
    trackerRef.current?.setSensitivityPreset(preset);
  }, []);

  const handleSetControlProfile = useCallback((profile: ControlProfile) => {
    trackerRef.current?.setControlProfile(profile);
  }, []);

  const handleSetSensitivity = useCallback((val: number) => {
    trackerRef.current?.setSensitivity(val);
  }, []);

  const handleSetTrackingMode = useCallback((mode: TrackingMode) => {
    trackerRef.current?.setTrackingMode(mode, true);
  }, []);

  const handleMouseTilt = useCallback((pitch: number, roll: number) => {
    trackerRef.current?.setMouseTilt(pitch, roll);
  }, []);

  return (
    <div
      className="relative h-dvh w-screen overflow-hidden bg-[#170f0a] font-sans select-none"
      data-testid="balance-maze-app"
    >
      {/* 3D Three.js Wooden Labyrinth Viewport */}
      <ThreeLabyrinth
        missionMode={missionMode}
        missionState={missionUI}
        level={currentLevel}
        tilt={handState.smoothTilt}
        ball={ball}
        liveTiltRef={tiltRef}
        liveBallRef={ballRef}
        gameStatus={gameStatus}
        collectedGems={collectedGems}
        impactSparks={impactSparks}
        onMouseTilt={handleMouseTilt}
        trackingMode={handState.trackingMode}
      />

      {missionMode && cosmicEvent && (
        <div className="bm-cosmic-event" key={cosmicEvent.id} aria-live="polite" role="status">
          {cosmicEvent.text}
        </div>
      )}

      {/* Floating Webcam & Dual-Hand Detection Preview */}
      <WebcamOverlay
        presentationMode={presentationMode}
        trackingState={handState}
        onStartCamera={handleStartCamera}
        onStopCamera={handleStopCamera}
        onStartAutoCalibration={handleStartAutoCalibration}
        onSetSensitivityPreset={handleSetSensitivityPreset}
        onSetControlProfile={handleSetControlProfile}
        onSetSensitivity={handleSetSensitivity}
        onSetTrackingMode={handleSetTrackingMode}
      />

      {/* HUD Dock & Modals */}
      <HUD
        missionMode={missionMode}
        missionState={missionUI}
        onStartMission={() => startCosmicMission(0)}
        onSelectMissionChapter={(index) => startCosmicMission(index)}
        completedChapters={completedChapters}
        onActivateStasis={activateMissionPower}
        pinchGestureAvailable={handState.trackingMode === 'camera' && handState.isCameraActive && handState.engine === 'mediapipe'}
        missionChapters={COSMIC_MISSIONS}
        presentationMode={presentationMode}
        level={currentLevel}
        allLevels={LEVELS}
        currentLevelIndex={levelIndex}
        gameStatus={gameStatus}
        elapsedTime={elapsedTime}
        bestTime={currentLevel.id === 99 ? null : (bestTimes[currentLevel.id] || null)}
        collectedGemsCount={collectedGems.size}
        totalGemsCount={currentLevel.gems.length}
        tilt={handState.smoothTilt}
        ballSpeed={Math.sqrt(ball.vx * ball.vx + ball.vz * ball.vz)}
        isMuted={isMuted}
        onSelectLevel={handleSelectLevel}
        onRestart={restartLevel}
        onNextLevel={advanceLevel}
        onToggleSound={handleToggleSound}
        onStartRandomLevel={handleStartRandomLevel}
      />
      <button
        type="button"
        onClick={() => setPresentationMode(p => !p)}
        title={presentationMode ? 'Вернуть панель (P или Esc)' : 'Чистый режим для демонстрации (P)'}
        className="bm-presentation-button"
      >
        {presentationMode ? <Minimize2 size={15}/> : <Maximize2 size={15}/>}
        {presentationMode ? 'Настройки · P' : 'Режим показа · P'}
      </button>
    </div>
  );
}
