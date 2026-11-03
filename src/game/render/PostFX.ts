import Phaser from 'phaser';

const FRAG = `
#define SHADER_NAME ECHOZERO_POST
precision highp float;
uniform sampler2D uMainSampler;
uniform float uTime;
uniform vec2 uRes;
uniform float uGrain;
uniform float uHalftone;
uniform float uVignette;
uniform float uGlitch;
uniform float uDistort;
uniform float uRewind;
uniform float uVision;
uniform float uFlash;
uniform float uFade;
uniform float uContrast;
varying vec2 outTexCoord;

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec2 uv = outTexCoord;
  vec2 c = uv - 0.5;

  // persistent wobble (the lab / the end of the building)
  uv.x += sin(uv.y * 22.0 + uTime * 2.1) * 0.0035 * uDistort + sin(uv.y * 4.0 - uTime * 0.8) * 0.007 * uDistort;
  uv.y += sin(uv.x * 14.0 + uTime * 1.7) * 0.0025 * uDistort;

  // transient glitch bands
  float fr = floor(uTime * 20.0);
  float band = floor(uv.y * 26.0);
  float r = hash(vec2(band, fr));
  float gl = step(0.84, r) * uGlitch;
  uv.x += (r - 0.5) * 0.14 * gl;
  float tear = step(0.985, hash(vec2(fr, 3.0))) * uGlitch;
  uv.y += tear * 0.05 * sin(uv.x * 30.0);

  // rewind: horizontal jitter + vertical roll
  float rj = hash(vec2(floor(uv.y * 90.0), floor(uTime * 30.0)));
  uv.x += (rj - 0.5) * 0.012 * uRewind;
  uv.y = mix(uv.y, fract(uv.y + uTime * 0.6), uRewind * 0.0);

  // foresight: breathing lens distortion
  vec2 cv = uv - 0.5;
  float d2 = dot(cv, cv);
  uv = 0.5 + cv * (1.0 - uVision * (0.055 + 0.02 * sin(uTime * 2.0)) * (0.4 + d2 * 3.0));

  vec3 col = texture2D(uMainSampler, clamp(uv, 0.0, 1.0)).rgb;
  float lum = dot(col, vec3(0.299, 0.587, 0.114));

  // ghosted double image while foreseeing / rewinding
  float ghostAmt = max(uVision * 0.5, uRewind * 0.45);
  if (ghostAmt > 0.001) {
    float o = 0.006 + 0.01 * ghostAmt;
    float l2 = dot(texture2D(uMainSampler, clamp(uv + vec2(o, 0.0), 0.0, 1.0)).rgb, vec3(0.299, 0.587, 0.114));
    float l3 = dot(texture2D(uMainSampler, clamp(uv - vec2(o * 1.5, 0.0), 0.0, 1.0)).rgb, vec3(0.299, 0.587, 0.114));
    lum = mix(lum, max(lum, max(l2, l3) * 0.82), ghostAmt);
  }

  // graphic-novel contrast curve
  lum = clamp((lum - 0.5) * uContrast + 0.5, 0.0, 1.0);
  lum = smoothstep(0.0, 1.0, lum * 0.92 + 0.04);

  // halftone (45 degree dot screen)
  vec2 px = gl_FragCoord.xy;
  float cell = 4.0;
  vec2 q = vec2(px.x + px.y, px.y - px.x) * 0.70710678 / cell;
  vec2 f = fract(q) - 0.5;
  float dd = length(f);
  float rad = sqrt(clamp(lum, 0.0, 1.0)) * 0.72;
  float dots = smoothstep(rad + 0.14, rad - 0.14, dd);
  lum = mix(lum, dots, uHalftone * 0.30);

  // film grain + flicker
  float gr = hash(px + fract(uTime) * 713.0) - 0.5;
  lum += gr * 0.13 * uGrain;
  lum *= 1.0 + (hash(vec2(fr, 7.0)) - 0.5) * 0.04 * uGrain;

  // faint scanlines
  lum *= 1.0 - 0.035 * (0.5 + 0.5 * sin(px.y * 3.14159));

  // vignette
  float vd = length(c * vec2(1.0, 1.15));
  lum *= 1.0 - uVignette * smoothstep(0.32, 0.92, vd);

  // rewind flashes invert the tones
  float inv = uRewind * step(0.9, hash(vec2(floor(uTime * 14.0), 1.0)));
  lum = mix(lum, 1.0 - lum, inv * 0.8);
  lum = mix(lum, lum * 0.6 + 0.22, uRewind * 0.35);

  lum = mix(lum, 1.0, uFlash);
  lum *= 1.0 - uFade;
  gl_FragColor = vec4(vec3(clamp(lum, 0.0, 1.0)), 1.0);
}
`;

export interface PostParams {
  grain: number;
  halftone: number;
  vignette: number;
  glitch: number;
  distort: number;
  rewind: number;
  vision: number;
  flash: number;
  fade: number;
  contrast: number;
}

export const postParams: PostParams = {
  grain: 1,
  halftone: 1,
  vignette: 0.8,
  glitch: 0,
  distort: 0,
  rewind: 0,
  vision: 0,
  flash: 0,
  fade: 0,
  contrast: 1.18,
};

export class EchoPostPipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  static KEY = 'EchoPost';
  constructor(game: Phaser.Game) {
    super({ game, name: EchoPostPipeline.KEY, fragShader: FRAG });
  }
  onPreRender() {
    const p = postParams;
    this.set1f('uTime', this.game.loop.time / 1000);
    this.set2f('uRes', this.renderer.width, this.renderer.height);
    this.set1f('uGrain', p.grain);
    this.set1f('uHalftone', p.halftone);
    this.set1f('uVignette', p.vignette);
    this.set1f('uGlitch', p.glitch);
    this.set1f('uDistort', p.distort);
    this.set1f('uRewind', p.rewind);
    this.set1f('uVision', p.vision);
    this.set1f('uFlash', p.flash);
    this.set1f('uFade', p.fade);
    this.set1f('uContrast', p.contrast);
  }
}
