import React, { useState } from 'react';
import {
  RotateCcw,
  Volume2,
  VolumeX,
  Trophy,
  HelpCircle,
  Gem as GemIcon,
  Timer,
  ArrowRight,
  Compass,
  Maximize2,
  ChevronUp,
  ChevronDown,
  Sparkles,
  XCircle,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { chapterIndex, type MissionState } from '../game/mission.ts';
import type { GameStatus, LevelConfig, TiltState } from '../game/types.ts';

interface HUDProps {
  missionMode: boolean;
  missionState: MissionState;
  onStartMission: () => void;
  onSelectMissionChapter: (chapter: number) => void;
  missionChapters: LevelConfig[];
  completedChapters: number[];
  onActivateStasis: () => void;
  pinchGestureAvailable: boolean;
  presentationMode?: boolean;
  level: LevelConfig;
  allLevels: LevelConfig[];
  currentLevelIndex: number;
  gameStatus: GameStatus;
  elapsedTime: number;
  bestTime: number | null;
  collectedGemsCount: number;
  totalGemsCount: number;
  tilt: TiltState;
  ballSpeed?: number;
  isMuted: boolean;
  onSelectLevel: (index: number) => void;
  onRestart: () => void;
  onNextLevel: () => void;
  onToggleSound: () => void;
  onStartRandomLevel: () => void;
}

export const HUD: React.FC<HUDProps> = ({
  missionMode,
  missionState,
  onStartMission,
  onSelectMissionChapter,
  missionChapters,
  completedChapters,
  onActivateStasis,
  pinchGestureAvailable,
  presentationMode = false,
  level,
  allLevels,
  currentLevelIndex,
  gameStatus,
  elapsedTime,
  bestTime,
  collectedGemsCount,
  totalGemsCount,
  tilt,
  ballSpeed = 0,
  isMuted,
  onSelectLevel,
  onRestart,
  onNextLevel,
  onToggleSound,
  onStartRandomLevel,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showVictory, setShowVictory] = useState(false);
  React.useEffect(() => {
    if (gameStatus !== 'won') {
      setShowVictory(false);
      return;
    }
    if (!missionMode) {
      setShowVictory(true);
      return;
    }
    setShowVictory(false);
    const timer = window.setTimeout(() => setShowVictory(true), 1900);
    return () => window.clearTimeout(timer);
  }, [gameStatus, missionMode, level.id]);
  const currentChapter = chapterIndex(level);
  const allChaptersDone = completedChapters.length >= missionChapters.length;

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    const ms = Math.floor((secs % 1) * 10);
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms}`;
  };

  const rollDeg = Math.round((tilt.roll * 180) / Math.PI);
  const pitchDeg = Math.round((tilt.pitch * 180) / Math.PI);

  React.useEffect(() => {
    if (gameStatus === 'won') {
      confetti({
        particleCount: 90,
        spread: 75,
        origin: { y: 0.62 },
        colors: ['#ffd68a', '#f59e0b', '#d4af37', '#7ee7c3', '#ffffff'],
      });
    }
  }, [gameStatus]);

  const subtitle = missionMode
    ? level.name
    : level.id === 99
      ? 'Random Maze'
      : `Level ${Math.max(1, currentLevelIndex + 1)} — ${level.name}`;

  return (
    <>
      <div className="bm-title-plaque" data-testid="level-title-plaque">
        <span className="bm-title-medallion" aria-hidden="true" />
        <div className="bm-title-copy">
          <div className="bm-title-top">
            <h1>Balance Maze</h1>
            <span className="bm-difficulty-tag">{level.difficulty.toUpperCase()}</span>
          </div>
          <p className="bm-title-sub">{subtitle}</p>
        </div>
      </div>

      {presentationMode && (
        <div className="fixed top-5 right-5 z-30 flex items-center gap-3 rounded-2xl border border-[#6f5121]/70 bg-[linear-gradient(180deg,rgba(18,12,8,0.92),rgba(27,19,12,0.9))] px-4 py-2 text-[#f5ead2] shadow-2xl backdrop-blur-md">
          <div className="flex items-center gap-1.5 text-xs">
            <Timer size={14} className="text-amber-300" />
            <span className="font-mono font-semibold">{formatTime(elapsedTime)}</span>
          </div>
          {totalGemsCount > 0 && (
            <div className="flex items-center gap-1.5 text-xs">
              <GemIcon size={14} className="text-emerald-300" />
              <span className="font-mono">{collectedGemsCount}/{totalGemsCount}</span>
            </div>
          )}
        </div>
      )}

      {!presentationMode && (
        <div className="fixed bottom-5 left-1/2 z-30 flex -translate-x-1/2 flex-col items-center">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="bm-bottom-pill"
            aria-label={isCollapsed ? 'Показать панель управления' : 'Скрыть панель управления'}
          >
            {isCollapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            <span>{isCollapsed ? 'Show Controls' : 'Hide Controls'}</span>
          </button>

          {!isCollapsed && (
            <div className="w-[min(94vw,1180px)] rounded-[24px] border border-[#5b4520]/80 bg-[linear-gradient(180deg,rgba(18,13,9,0.96),rgba(27,20,14,0.94))] px-5 py-4 text-[#f5e7cb] shadow-[0_22px_55px_rgba(0,0,0,0.52)] backdrop-blur-md">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  {allLevels.map((lvl, idx) => (
                    <button
                      key={lvl.id}
                      onClick={() => onSelectLevel(idx)}
                      className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                        currentLevelIndex === idx && level.id !== 99
                          ? 'border-[#d89a34] bg-[#c78213] text-white shadow-[0_0_0_1px_rgba(255,209,123,0.22)]'
                          : 'border-[#443321] bg-[#120f0c] text-[#d7c4a0] hover:border-[#705126] hover:text-white'
                      }`}
                    >
                      {lvl.id === 0 ? 'Tutorial' : lvl.id}
                    </button>
                  ))}
                  <button
                    onClick={onStartRandomLevel}
                    className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                      level.id === 99
                        ? 'border-[#d89a34] bg-[#c78213] text-white'
                        : 'border-[#534028] bg-[#16120d] text-[#e0bb71] hover:border-[#705126]'
                    }`}
                  >
                    Random
                  </button>
                </div>

                <div className="hidden h-10 w-px bg-[#3d2c1a] md:block" />

                <div className="flex flex-wrap items-center gap-4 text-sm">
                  <div className="flex items-center gap-1.5 rounded-xl border border-[#3d2c1a] bg-black/20 px-3 py-2">
                    <Timer size={15} className="text-amber-300" />
                    <span className="font-mono">{formatTime(elapsedTime)}</span>
                  </div>
                  {totalGemsCount > 0 && (
                    <div className="flex items-center gap-1.5 rounded-xl border border-[#3d2c1a] bg-black/20 px-3 py-2">
                      <GemIcon size={15} className="text-emerald-300" />
                      <span className="font-mono">{collectedGemsCount}/{totalGemsCount}</span>
                    </div>
                  )}
                  <div className="hidden items-center gap-1.5 rounded-xl border border-[#3d2c1a] bg-black/20 px-3 py-2 md:flex">
                    <Compass size={14} className="text-amber-300" />
                    <span className="font-mono text-xs">R:{rollDeg}° P:{pitchDeg}°</span>
                  </div>
                  <div className="hidden items-center gap-1.5 rounded-xl border border-[#3d2c1a] bg-black/20 px-3 py-2 lg:flex">
                    <Sparkles size={14} className="text-amber-300" />
                    <span className="font-mono text-xs">{ballSpeed.toFixed(1)} m/s</span>
                  </div>
                </div>

                <div className="ml-auto flex items-center gap-2">
                  <button
                    onClick={onRestart}
                    className="rounded-xl border border-[#4b371f] bg-[#15110d] p-2.5 text-[#eadcc2] transition hover:border-[#84571d] hover:bg-[#241911]"
                    title="Restart level (R)"
                  >
                    <RotateCcw size={16} />
                  </button>
                  <button
                    onClick={onToggleSound}
                    className="rounded-xl border border-[#4b371f] bg-[#15110d] p-2.5 text-[#eadcc2] transition hover:border-[#84571d] hover:bg-[#241911]"
                    title={isMuted ? 'Enable sound' : 'Disable sound'}
                  >
                    {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                  </button>
                  <button
                    onClick={() => setShowHelpModal(true)}
                    className="rounded-xl border border-[#4b371f] bg-[#15110d] p-2.5 text-[#eadcc2] transition hover:border-[#84571d] hover:bg-[#241911]"
                    title="How to play"
                  >
                    <HelpCircle size={16} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {!presentationMode && (
        <div className="bm-mission-panel" aria-label="Космическое путешествие">
          <div className="bm-mission-eyebrow">✦ КОСМИЧЕСКАЯ ЭКСПЕДИЦИЯ</div>
          {!missionMode ? (
            <>
              <div className="bm-mission-headline">Три загадочные планеты ждут тебя</div>
              <p className="bm-mission-description">Спасай маяки, проходи порталы и освой управление временем.</p>
              <button type="button" onClick={onStartMission} className="bm-mission-primary">
                🚀 НАЧАТЬ ПУТЕШЕСТВИЕ
              </button>
              {completedChapters.length > 0 && (
                <div className="bm-chapter-selector" aria-label="Открытые миссии">
                  {missionChapters.map((chapter, i) => (
                    <button key={chapter.id} type="button"
                      disabled={i > 0 && !completedChapters.includes(i - 1)}
                      onClick={() => onSelectMissionChapter(i)}
                      title={chapter.name}
                      className="bm-chapter-dot">
                      {completedChapters.includes(i) ? '★' : i+1}
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="bm-mission-headline">
                Этап {currentChapter + 1}/{missionChapters.length} · {currentChapter === 0 ? 'Сатурн' : currentChapter === 1 ? 'Луна' : 'Туманность'}
              </div>
              <div className="bm-mission-progress">
                {missionChapters.map((chapter, i) => (
                  <span key={chapter.id} className={`bm-mission-progress-node ${completedChapters.includes(i) ? 'is-done' : ''} ${i === currentChapter ? 'is-active' : ''}`}>
                    {completedChapters.includes(i) ? '★' : i+1}
                  </span>
                ))}
              </div>
              <div className="bm-mission-beacons">✧ Маяки: {missionState.beacons}/{level.gems.length} <span>· Прыжки: {missionState.hops}</span></div>
              <p className="bm-mission-description" aria-live="polite">{missionState.message}</p>
              <button type="button" className="bm-stasis-button"
                onClick={onActivateStasis}
                disabled={missionState.charges === 0 || missionState.stasisRemaining > 0 || gameStatus !== 'playing'}>
                <span>⌛</span>
                {missionState.stasisRemaining > 0
                  ? `ЗАМЕДЛЕНИЕ · ${missionState.stasisRemaining.toFixed(1)} с`
                  : `ЗАМЕДЛИТЬ ВРЕМЯ · ${missionState.charges} зар.`}
              </button>
              <div className="bm-mission-tip">
                {pinchGestureAvailable
                  ? '🤏 Соедини большой и указательный пальцы ЛЮБОЙ руки на 0,2 с. Разомкни пальцы перед следующим использованием.'
                  : '🤏 С камерой и MediaPipe: соедини большой и указательный пальцы любой руки. Без камеры — пробел или кнопка.'}
              </div>
              <div className="bm-mission-tip">Маяки пополняют заряды · кнопку и пробел можно использовать как запасное управление.</div>
              {allChaptersDone && <div className="bm-mission-tip">★ Экспедиция пройдена!</div>}
            </>
          )}
        </div>
      )}

      {gameStatus === 'won' && showVictory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-[28px] border border-[#9c6a1e]/65 bg-[linear-gradient(180deg,rgba(20,14,10,0.98),rgba(30,21,13,0.98))] p-6 text-center text-[#f4e6ca] shadow-[0_28px_80px_rgba(0,0,0,0.65)]">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-[#b4822d] bg-[radial-gradient(circle_at_30%_30%,rgba(255,211,141,0.2),rgba(168,109,23,0.15))] text-amber-300">
              <Trophy size={30} />
            </div>
            <h2 className="text-2xl font-semibold" style={{ fontFamily: 'Georgia, Times New Roman, serif' }}>{missionMode ? (currentChapter === missionChapters.length - 1 ? '🚀 Экспедиция завершена!' : '🌟 Миссия выполнена!') : 'Level Complete'}</h2>
            <p className="mt-1 text-sm text-[#c9b48b]">{missionMode ? (currentChapter === missionChapters.length - 1 ? 'Все миры спасены! Экспедиция завершена.' : 'Маяки спасены! Следующая планета ждёт.') : 'Your marble reached the goal.'}</p>

            <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-2xl border border-[#403120] bg-black/20 p-3">
                <div className="text-xs uppercase tracking-[0.08em] text-[#9f8964]">Time</div>
                <div className="mt-1 font-mono text-lg font-semibold text-white">{formatTime(elapsedTime)}</div>
              </div>
              <div className="rounded-2xl border border-[#403120] bg-black/20 p-3">
                <div className="text-xs uppercase tracking-[0.08em] text-[#9f8964]">{missionMode ? 'Маяки' : 'Gems'}</div>
                <div className="mt-1 font-mono text-lg font-semibold text-white">{collectedGemsCount}/{totalGemsCount}</div>
              </div>
            </div>

            {bestTime !== null && (
              <div className="mt-4 rounded-2xl border border-[#403120] bg-black/20 p-3 text-sm text-[#dcc9a6]">
                Best time: <span className="font-mono text-white">{formatTime(bestTime)}</span>
              </div>
            )}

            <div className="mt-6 flex gap-3">
              <button onClick={onRestart} className="flex-1 rounded-2xl border border-[#4f3c22] bg-[#16110d] px-4 py-3 font-semibold text-[#f1dfbd] transition hover:bg-[#241911]">
                Restart
              </button>
              <button onClick={onNextLevel} className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-[#d89a34] bg-[#c78213] px-4 py-3 font-semibold text-white transition hover:bg-[#d08d1d]">
                {missionMode ? (currentChapter === missionChapters.length - 1 ? 'В классический режим' : 'К следующей планете') : 'Next'} <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {gameStatus === 'fallen' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-[28px] border border-[#6d2f1d]/65 bg-[linear-gradient(180deg,rgba(22,14,10,0.98),rgba(31,18,13,0.98))] p-6 text-center text-[#f4e6ca] shadow-[0_28px_80px_rgba(0,0,0,0.65)]">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-[#8f4331] bg-[radial-gradient(circle_at_30%_30%,rgba(255,150,130,0.18),rgba(118,43,27,0.15))] text-rose-300">
              <XCircle size={30} />
            </div>
            <h2 className="text-2xl font-semibold" style={{ fontFamily: 'Georgia, Times New Roman, serif' }}>Вы проиграли</h2>
            <p className="mt-1 text-sm text-[#c9b48b]">Шарик упал в лунку. Начните заново.</p>
            <div className="mt-6 flex gap-3">
              <button onClick={onRestart} className="flex-1 rounded-2xl border border-[#d89a34] bg-[#c78213] px-4 py-3 font-semibold text-white transition hover:bg-[#d08d1d]">
                Restart Level
              </button>
            </div>
          </div>
        </div>
      )}

      {showHelpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setShowHelpModal(false)}>
          <div className="w-full max-w-lg rounded-[28px] border border-[#6e5126]/70 bg-[linear-gradient(180deg,rgba(20,14,10,0.98),rgba(32,22,14,0.98))] p-6 text-[#f4e6ca] shadow-[0_28px_80px_rgba(0,0,0,0.65)]" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-semibold" style={{ fontFamily: 'Georgia, Times New Roman, serif' }}>How to Play</h3>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-[#d7c4a0]">
              <p><strong className="text-white">Goal:</strong> tilt the wooden board and guide the metal ball to the target.</p>
              <p><strong className="text-white">Camera mode:</strong> raise both hands in front of the camera. Use the right panel to choose a control style and sensitivity.</p>
              <p><strong className="text-white">Mouse / WASD:</strong> use them as fallback controls if the room lighting is poor.</p>
              <p><strong className="text-white">Gems:</strong> collect crystals on classic levels. In Cosmic Voyage activate each stage's rescue beacons to unlock victory; beacons also charge the time-dilation ability. With MediaPipe camera tracking, bring the thumb and index fingertips together on either hand for 0.2 s; release to re-arm. Press Space or use the mission panel as a fallback.</p>
              <p><strong className="text-white">Shortcuts:</strong> R — restart, C — auto calibrate, P — presentation mode.</p>
            </div>
            <button onClick={() => setShowHelpModal(false)} className="mt-6 w-full rounded-2xl border border-[#4f3c22] bg-[#16110d] px-4 py-3 font-semibold text-[#f1dfbd] transition hover:bg-[#241911]">
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
};
