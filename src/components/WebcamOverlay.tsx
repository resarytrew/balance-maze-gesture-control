import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  CameraOff,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleHelp,
  Gauge,
  Hand,
  Keyboard,
  MousePointer2,
  RefreshCcw,
  ScanLine,
  Settings2,
  ShieldAlert,
  SlidersHorizontal,
} from 'lucide-react';
import type { HandTrackingState } from '../game/types.ts';
import type { ControlProfile, SensitivityPreset } from '../game/handTracker.ts';

interface WebcamOverlayProps {
  presentationMode?: boolean;
  trackingState: HandTrackingState;
  onStartCamera: (video: HTMLVideoElement) => Promise<boolean>;
  onStopCamera: () => void;
  onStartAutoCalibration: () => void;
  onSetSensitivityPreset: (preset: SensitivityPreset) => void;
  onSetControlProfile: (profile: ControlProfile) => void;
  onSetSensitivity: (val: number) => void;
  onSetTrackingMode: (mode: 'camera' | 'mouse' | 'keyboard') => void;
}

export const WebcamOverlay: React.FC<WebcamOverlayProps> = ({
  presentationMode = false,
  trackingState,
  onStartCamera,
  onStopCamera,
  onStartAutoCalibration,
  onSetSensitivityPreset,
  onSetControlProfile,
  onSetSensitivity,
  onSetTrackingMode,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isMinimized, setIsMinimized] = useState(() => window.innerWidth < 740);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [isStartingCamera, setIsStartingCamera] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const stateRef = useRef(trackingState);
  stateRef.current = trackingState;

  const toggleCamera = async () => {
    if (isStartingCamera) return;
    if (trackingState.isCameraActive) {
      onStopCamera();
      setCameraError(null);
      return;
    }
    if (!videoRef.current) return;
    setIsStartingCamera(true);
    setCameraError(null);
    try {
      const ok = await onStartCamera(videoRef.current);
      if (!ok) setCameraError('Не удалось включить камеру. Используйте мышь или WASD.');
    } catch {
      setCameraError('Не удалось включить камеру. Проверьте разрешение браузера.');
    } finally {
      setIsStartingCamera(false);
    }
  };

  // The tracking preview is updated independently of React state and Three.js rendering.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let frameId = 0;
    const render = () => {
      frameId = requestAnimationFrame(render);
      const s = stateRef.current;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      if (!s.isCameraActive || !s.hasLeftHand || !s.hasRightHand || !s.leftHand || !s.rightHand) return;
      const lx = s.leftHand.x * w;
      const ly = s.leftHand.y * h;
      const rx = s.rightHand.x * w;
      const ry = s.rightHand.y * h;
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(rx, ry);
      ctx.strokeStyle = 'rgba(249,196,103,0.9)';
      ctx.lineWidth = 2.3;
      ctx.stroke();
      for (const [x, y, name] of [[lx, ly, 'L'], [rx, ry, 'R']] as const) {
        ctx.beginPath();
        ctx.arc(x, y, 12, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(229,159,56,0.19)';
        ctx.fill();
        ctx.strokeStyle = '#ffda8a';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.font = 'bold 11px sans-serif';
        ctx.fillStyle = '#ffe8b4';
        ctx.fillText(name, x - 4, y - 18);
      }
    };
    frameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frameId);
  }, [isMinimized]);

  const cameraConnected = trackingState.isCameraActive;
  const handsVisible = trackingState.hasLeftHand && trackingState.hasRightHand && !trackingState.trackingLost;
  const cameraStatusText = !cameraConnected ? 'OFFLINE' : handsVisible ? 'TRACKING' : 'CONNECTED';
  const roll = Math.round(trackingState.smoothTilt.roll * (180 / Math.PI));
  const pitch = Math.round(trackingState.smoothTilt.pitch * (180 / Math.PI));

  return (
    <aside
      data-testid="webcam-overlay"
      className={`bm-camera-panel ${presentationMode ? 'bm-hidden-presentation' : ''}`}
      aria-label="Управление камерой"
    >
      <div className="bm-panel-header">
        <div className="bm-panel-title"><Camera size={21} strokeWidth={2.1} /> <span>WEBCAM (HAND TRACKING)</span></div>
        <div className="bm-panel-header-right">
          <span className={`bm-camera-status ${cameraConnected ? 'is-live' : 'is-offline'}`}>
            <i />{cameraStatusText}
          </span>
          <button type="button" className="bm-icon-plain" aria-label={isMinimized ? 'Развернуть настройки камеры' : 'Свернуть настройки камеры'} onClick={() => setIsMinimized(v => !v)}>
            {isMinimized ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </button>
        </div>
      </div>

      <div className={`bm-panel-body ${isMinimized ? 'bm-panel-body-minimized' : ''}`}>
        <div className="bm-camera-preview">
          <video ref={videoRef} playsInline muted className={`bm-camera-feed ${cameraConnected ? '' : 'is-hidden'}`} />
          <canvas ref={canvasRef} width={320} height={200} className={`bm-camera-annotation ${cameraConnected ? '' : 'is-hidden'}`} />
          {(!cameraConnected || !handsVisible) && !trackingState.isCalibrating && (
            <div className="bm-camera-message">
              <div className="bm-hand-ring">{cameraConnected ? <Hand size={25} /> : <Camera size={26} />}</div>
              <strong>{cameraConnected ? 'Руки не обнаружены' : 'Камера выключена'}</strong>
              <span>{cameraConnected ? 'Поднимите обе ладони перед камерой, чтобы управлять доской' : 'Включите камеру для управления руками'}</span>
              {!cameraConnected && (
                <button type="button" className="bm-start-camera" onClick={toggleCamera} disabled={isStartingCamera}>
                  <Camera size={14} /> {isStartingCamera ? 'Подключение...' : 'Включить камеру'}
                </button>
              )}
            </div>
          )}
          {cameraConnected && handsVisible && !trackingState.isCalibrating && (
            <div className="bm-camera-preview-footer">
              <span>● Обе руки распознаны</span><span>R {roll}° · P {pitch}°</span>
            </div>
          )}
          {trackingState.isCalibrating && (
            <div className="bm-camera-message bm-camera-calibrating">
              <RefreshCcw size={26} className="bm-spinning" />
              <strong>Калибровка…</strong>
              <span>Держите обе ладони неподвижно</span>
              <div className="bm-calibration-track"><div style={{ width: `${Math.max(0, Math.min(100, trackingState.calibrationProgress * 100))}%` }} /></div>
            </div>
          )}
        </div>
        {cameraError && <p className="bm-error" role="alert"><ShieldAlert size={14} /> {cameraError}</p>}

        <section className="bm-panel-section bm-tracking-section" aria-label="Режим распознавания">
          <h2 className="bm-section-title"><Hand size={16} /> TRACKING MODE</h2>
          <div className="bm-tracking-cards">
            <div className="bm-tracking-card is-selected" aria-current="true">
              <div className="bm-tracking-glyph"><Hand size={21}/><Hand size={21}/></div>
              <strong>Both Hands</strong><span>Tilt to Move</span>
            </div>
            <div className="bm-tracking-card is-unavailable" title="Режим одной левой руки пока не реализован">
              <Hand size={27} strokeWidth={1.5} /><strong>Left Hand</strong><span>Unavailable</span>
            </div>
            <div className="bm-tracking-card is-unavailable" title="Режим одной правой руки пока не реализован">
              <Hand size={27} strokeWidth={1.5} /><strong>Right Hand</strong><span>Unavailable</span>
            </div>
          </div>
        </section>

        <section className="bm-panel-section bm-sensitivity-section" aria-label="Чувствительность">
          <div className="bm-section-row"><h2 className="bm-section-title"><Gauge size={16} /> SENSITIVITY</h2><output className="bm-value">{trackingState.sensitivity.toFixed(1)}x</output></div>
          <input aria-label="Чувствительность управления" type="range" min="0.4" max="2.5" step="0.05" value={trackingState.sensitivity} onChange={e => onSetSensitivity(Number(e.target.value))} className="bm-range" style={{ '--range-percent': `${100 * (trackingState.sensitivity - 0.4) / 2.1}%` } as React.CSSProperties}/>
          <div className="bm-choice-row">
            {(['precision','normal','fast'] as const).map(preset => (
              <button type="button" key={preset} aria-pressed={trackingState.sensitivityPreset === preset} className={`bm-choice ${trackingState.sensitivityPreset === preset ? 'is-selected' : ''}`} onClick={() => onSetSensitivityPreset(preset)}>
                {preset === 'precision' ? 'Precise' : preset === 'normal' ? 'Balanced' : 'Responsive'}
              </button>
            ))}
          </div>
        </section>

        <section className="bm-panel-section bm-input-section" aria-label="Способ управления">
          <h2 className="bm-section-title"><Camera size={16}/> CONTROLS</h2>
          <div className="bm-choice-row">
            <button type="button" aria-pressed={trackingState.trackingMode === 'camera'} className={`bm-choice bm-control-button ${trackingState.trackingMode === 'camera' ? 'is-selected' : ''}`} onClick={() => {
              if (!trackingState.isCameraActive) toggleCamera();
              else onSetTrackingMode('camera');
            }}><Camera size={14}/> Camera</button>
            <button type="button" aria-pressed={trackingState.trackingMode === 'mouse'} className={`bm-choice bm-control-button ${trackingState.trackingMode === 'mouse' ? 'is-selected' : ''}`} onClick={() => onSetTrackingMode('mouse')}><MousePointer2 size={14}/> Mouse</button>
            <button type="button" aria-pressed={trackingState.trackingMode === 'keyboard'} className={`bm-choice bm-control-button ${trackingState.trackingMode === 'keyboard' ? 'is-selected' : ''}`} onClick={() => onSetTrackingMode('keyboard')}><Keyboard size={14}/> WASD</button>
          </div>
        </section>

        <button type="button" className="bm-calibrate-button" disabled={!cameraConnected || trackingState.isCalibrating} onClick={onStartAutoCalibration} title={!cameraConnected ? 'Сначала включите камеру' : 'Калибровка нейтрального положения (C)'}><ScanLine size={18} /> {trackingState.isCalibrating ? 'Calibrating...' : 'Auto Calibrate (C)'}</button>

        <button type="button" className={`bm-advanced-toggle ${advancedOpen ? 'is-expanded' : ''}`} aria-expanded={advancedOpen} onClick={() => setAdvancedOpen(v => !v)}><Settings2 size={19}/><span>Advanced Settings</span>{advancedOpen ? <ChevronUp size={17}/> : <ChevronRight size={17}/>}</button>
        {advancedOpen && (
          <div className="bm-advanced-content">
            <div className="bm-advanced-label"><SlidersHorizontal size={15} /> Способ наклона платформы</div>
            <div className="bm-choice-row bm-two-options">
              <button type="button" className={`bm-choice ${trackingState.controlProfile === 'virtual-board' ? 'is-selected' : ''}`} disabled={cameraConnected && trackingState.engine !== 'mediapipe'} onClick={() => onSetControlProfile('virtual-board')}>Доска в руках</button>
              <button type="button" className={`bm-choice ${trackingState.controlProfile === 'height-lever' ? 'is-selected' : ''}`} onClick={() => onSetControlProfile('height-lever')}>Высота ладоней</button>
            </div>
            <p className="bm-advanced-hint">{trackingState.controlProfile === 'virtual-board' ? 'Влево и вправо — разница высоты рук. Вперёд и назад — приближение обеих ладоней к камере или удаление от неё (приблизительная оценка глубины через MediaPipe).' : 'Влево и вправо — разница высоты рук. Вперёд и назад — одновременный подъём или опускание обеих рук.'}</p>
            <div className="bm-engine-label"><CircleHelp size={14}/> Сенсор: {trackingState.engine === 'mediapipe' ? 'MediaPipe (21 точка)' : trackingState.engine === 'fallback' ? 'Оптический резервный режим' : 'Ручной ввод'}</div>
            {cameraConnected && <button type="button" className="bm-stop-button" onClick={toggleCamera}><CameraOff size={15}/> Остановить камеру</button>}
          </div>
        )}
      </div>
    </aside>
  );
};
