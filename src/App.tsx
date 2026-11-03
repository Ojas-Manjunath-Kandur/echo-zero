import { useEffect, useRef, useState } from 'react';
import { createGame, startGame } from './game';
import { bus, HintPayload, TerminalPayload, TitleCardPayload } from './game/bus';
import { audio } from './game/audio/AudioManager';
import { clearSave, loadSave } from './game/settings';
import { Hud } from './ui/Hud';
import { SettingsPanel } from './ui/Settings';
import { Credits } from './ui/Credits';
import { Ending } from './ui/Ending';
import { SecretEnding } from './ui/SecretEnding';
import { ElevatorOverlay, PauseMenu, TerminalPanel, TitleCard } from './ui/Overlays';

type Screen = 'menu' | 'settings' | 'credits' | 'confirm' | 'playing';

export function App() {
  const stage = useRef<HTMLDivElement>(null);
  const [screen, setScreen] = useState<Screen>('menu');
  const [paused, setPaused] = useState(false);
  const [pauseSettings, setPauseSettings] = useState(false);
  const [terminal, setTerminal] = useState<TerminalPayload | null>(null);
  const [hint, setHint] = useState<HintPayload | null>(null);
  const [toast, setToast] = useState<{ text: string; id: number } | null>(null);
  const [title, setTitle] = useState<TitleCardPayload | null>(null);
  const [elevator, setElevator] = useState<{ from: string; to: string; ms: number } | null>(null);
  const [ending, setEnding] = useState<{ deaths: number; rewinds: number; seconds: number; secret?: boolean } | null>(null);
  const [save, setSave] = useState(loadSave());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = stage.current!;
    const host = el.querySelector('.canvas-host') as HTMLElement;
    createGame(host);
    const resize = () => el.style.setProperty('--u', String(el.clientWidth / 1280));
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    let toastId = 0;
    let toastTimer = 0;
    let titleTimer = 0;
    const subs: [string, (...a: any[]) => void][] = [
      ['booted', () => setReady(true)],
      ['state', (s: string) => {
        if (s === 'menu') {
          setScreen('menu');
          setPaused(false);
          setPauseSettings(false);
          setTerminal(null);
          setHint(null);
          setEnding(null);
          setElevator(null);
          setSave(loadSave());
        } else setScreen('playing');
      }],
      ['paused', (p: boolean) => { setPaused(p); if (!p) setPauseSettings(false); }],
      ['terminal', (t: TerminalPayload) => setTerminal(t)],
      ['terminal:close', () => setTerminal(null)],
      ['hint', (h: HintPayload | null) => setHint(h)],
      ['toast', (text: string) => {
        window.clearTimeout(toastTimer);
        setToast({ text, id: ++toastId });
        toastTimer = window.setTimeout(() => setToast(null), 3600);
      }],
      ['title', (t: TitleCardPayload) => {
        setElevator(null);
        setTitle(t);
        window.clearTimeout(titleTimer);
        titleTimer = window.setTimeout(() => setTitle(null), 4200);
      }],
      ['elevator', (e: { from: string; to: string; ms: number }) => setElevator(e)],
      ['ending:start', (s: { deaths: number; rewinds: number; seconds: number; secret?: boolean }) => setEnding(s)],
    ];
    for (const [ev, fn] of subs) bus.on(ev, fn);
    return () => {
      ro.disconnect();
      for (const [ev, fn] of subs) bus.off(ev, fn);
    };
  }, []);

  const begin = (level: number) => {
    audio.uiConfirm();
    setEnding(null);
    startGame(level);
  };
  const newGame = () => {
    clearSave();
    setSave(null);
    begin(0);
  };

  const inGame = screen === 'playing';
  return (
    <div className="root">
      <div className="stage" ref={stage}>
        <div className="canvas-host" />
        {inGame && !ending && <Hud />}
        {inGame && title && !elevator && <TitleCard data={title} />}
        {inGame && hint && !terminal && <div className="hint">{hint.text}</div>}
        {inGame && toast && !terminal && !ending && <div className="toast" key={toast.id}>{toast.text}</div>}
        {terminal && <TerminalPanel key={terminal.id} data={terminal} />}
        {elevator && <ElevatorOverlay key={elevator.to} {...elevator} />}
        {inGame && paused && !pauseSettings && <PauseMenu onSettings={() => setPauseSettings(true)} />}
        {inGame && paused && pauseSettings && (
          <div className="pause">
            <SettingsPanel onBack={() => setPauseSettings(false)} />
          </div>
        )}
        {ending && (ending.secret ? <SecretEnding /> : <Ending stats={ending} />)}

        {screen === 'menu' && (
          <div className="menu">
            <div className="logo">
              <span className="logo-a" data-t="ECHO">ECHO</span>
              <span className="logo-slash">//</span>
              <span className="logo-b" data-t="ZERO">ZERO</span>
            </div>
            <div className="tagline">{save?.secret ? 'THE LOOP IS BROKEN.' : 'THE BUILDING REMEMBERS YOU.'}</div>
            {!ready ? (
              <div className="loading">LOADING…</div>
            ) : (
              <nav>
                {save && save.level > 0 && !save.completed && (
                  <button className="btn big" onClick={() => begin(save.level)} onMouseEnter={() => audio.uiHover()}>
                    CONTINUE <small>FLOOR {save.level >= 5 ? 'B1' : String(5 - save.level).padStart(2, '0')}</small>
                  </button>
                )}
                <button
                  className="btn big"
                  onClick={() => (save && (save.level > 0 || save.completed) ? setScreen('confirm') : newGame())}
                  onMouseEnter={() => audio.uiHover()}
                >
                  NEW GAME
                </button>
                <button className="btn big" onClick={() => { audio.init(); audio.uiClick(); setScreen('settings'); }} onMouseEnter={() => audio.uiHover()}>
                  SETTINGS
                </button>
                <button className="btn big" onClick={() => { audio.init(); audio.uiClick(); setScreen('credits'); }} onMouseEnter={() => audio.uiHover()}>
                  CREDITS
                </button>
              </nav>
            )}
            <div className="menu-foot">A/D MOVE · SPACE JUMP · E INTERACT · HOLD R REWIND · HOLD F FORESIGHT · Q RELEASE ECHOES</div>
          </div>
        )}
        {screen === 'confirm' && (
          <div className="menu overlay-dim">
            <div className="panel">
              <h2>START OVER?</h2>
              <p>Your saved progress will be erased.</p>
              <div className="actions">
                <button className="btn" onClick={newGame}>ERASE &amp; START</button>
                <button className="btn" onClick={() => { audio.uiClick(); setScreen('menu'); }}>CANCEL</button>
              </div>
            </div>
          </div>
        )}
        {screen === 'settings' && (
          <div className="menu overlay-dim">
            <SettingsPanel onBack={() => setScreen('menu')} />
          </div>
        )}
        {screen === 'credits' && (
          <div className="menu overlay-dim">
            <Credits onBack={() => setScreen('menu')} />
          </div>
        )}
      </div>
    </div>
  );
}
