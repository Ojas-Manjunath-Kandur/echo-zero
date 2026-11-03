import { audio } from '../game/audio/AudioManager';

export function Credits({ onBack }: { onBack: () => void }) {
  return (
    <div className="panel credits">
      <h2>CREDITS</h2>
      <p className="big">ECHO//ZERO</p>
      <p>A cinematic time-manipulation thriller.</p>
      <dl>
        <dt>DESIGN, CODE, ART DIRECTION</dt>
        <dd>Ojas Manjunath Kandur, Pranav Aradhya M</dd>
        <dt>BUILT FOR</dt>
        <dd>CodeDay Hackathon</dd>
        <dt>ENGINE</dt>
        <dd>Phaser 3 · React · Vite · TypeScript</dd>
        <dt>SIMULATION</dt>
        <dd>Custom deterministic 60&nbsp;Hz fixed-timestep engine</dd>
        <dt>AUDIO</dt>
        <dd>100% procedural Web Audio — no samples, no licences</dd>
        <dt>ART</dt>
        <dd>100% procedural Canvas2D ink &amp; halftone — no image assets</dd>
      </dl>
      <p className="dim">Every sound and every picture in this game is made from code at runtime.</p>
      <div className="actions">
        <button className="btn" onClick={() => { audio.uiClick(); onBack(); }}>
          BACK
        </button>
      </div>
    </div>
  );
}
