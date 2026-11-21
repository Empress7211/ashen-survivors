import { STAGE_IDS, WEAPON_IDS, type ChestTier, type StageId, type WeaponId } from '../contracts/ids';
import type { AudioAndDisplaySettings, AudioCue } from '../contracts/types';

export type BgmTrackId = StageId | 'title';

export interface AudioParamLike {
  value: number;
  setValueAtTime(value: number, startTime: number): void;
  linearRampToValueAtTime?(value: number, endTime: number): void;
  exponentialRampToValueAtTime?(value: number, endTime: number): void;
  setTargetAtTime?(target: number, startTime: number, timeConstant: number): void;
}

export interface AudioNodeLike {
  connect(destination: AudioNodeLike): AudioNodeLike | void;
  disconnect?(): void;
}

export interface GainNodeLike extends AudioNodeLike {
  gain: AudioParamLike;
}

export interface OscillatorNodeLike extends AudioNodeLike {
  type: OscillatorType;
  frequency: AudioParamLike;
  detune?: AudioParamLike;
  start(when?: number): void;
  stop(when?: number): void;
}

export interface BiquadFilterNodeLike extends AudioNodeLike {
  type: BiquadFilterType;
  frequency: AudioParamLike;
  Q: AudioParamLike;
}

export interface AudioBufferLike {
  length: number;
  sampleRate: number;
  getChannelData(channel: number): Float32Array;
}

export interface AudioBufferSourceNodeLike extends AudioNodeLike {
  buffer: AudioBufferLike | null;
  loop?: boolean;
  start(when?: number): void;
  stop(when?: number): void;
}

export interface AudioContextLike {
  readonly state: AudioContextState;
  readonly currentTime: number;
  readonly sampleRate: number;
  readonly destination: AudioNodeLike;
  resume(): Promise<void>;
  close?(): Promise<void>;
  createGain(): GainNodeLike;
  createOscillator(): OscillatorNodeLike;
  createBiquadFilter(): BiquadFilterNodeLike;
  createBuffer(numberOfChannels: number, length: number, sampleRate: number): AudioBufferLike;
  createBufferSource(): AudioBufferSourceNodeLike;
}

export interface AudioEngineOptions {
  contextFactory?: () => AudioContextLike | null;
  maxSfxVoices?: number;
  bgmTickIntervalMs?: number;
}

export interface AudioEngineStats {
  playedCount: number;
  throttledCount: number;
  voiceLimitedCount: number;
  activeVoices: number;
  bgmNotesScheduled: number;
}

interface ActiveVoice {
  endTime: number;
  priority: number;
  category: string;
}

export interface WeaponSynthProfile {
  waveform: OscillatorType;
  baseFreq: number;
  endFreq: number;
  duration: number;
  gain: number;
  cooldown: number;
  noiseGain?: number;
  filterFreq?: number;
  filterType?: BiquadFilterType;
  harmonicRatio?: number;
}

export interface StageBgmProfile {
  bpm: number;
  rootMidi: number;
  scaleIntervals: readonly number[];
  bassPattern: readonly number[];
  arpPattern: readonly number[];
  organWaveform: OscillatorType;
  arpWaveform: OscillatorType;
}

const DEFAULT_MAX_SFX_VOICES = 24;
const HIGH_PRIORITY_HEADROOM = 4;
const XP_STREAK_RESET_SECONDS = 0.48;
const XP_SCALE_SEMITONES = [0, 2, 3, 5, 7, 8, 11, 12, 14, 15, 17, 19, 20, 23, 24] as const;

export const WEAPON_SYNTH_PROFILES: Readonly<Record<WeaponId, WeaponSynthProfile>> = {
  whip: {
    waveform: 'sawtooth',
    baseFreq: 320,
    endFreq: 110,
    duration: 0.11,
    gain: 0.22,
    cooldown: 0.1,
    noiseGain: 0.18,
    filterFreq: 1900,
    filterType: 'bandpass',
  },
  bloody_tear: {
    waveform: 'sawtooth',
    baseFreq: 290,
    endFreq: 85,
    duration: 0.14,
    gain: 0.25,
    cooldown: 0.1,
    noiseGain: 0.2,
    filterFreq: 2200,
    filterType: 'bandpass',
    harmonicRatio: 1.5,
  },
  magic_wand: {
    waveform: 'sine',
    baseFreq: 740,
    endFreq: 1120,
    duration: 0.12,
    gain: 0.18,
    cooldown: 0.09,
    harmonicRatio: 1.5,
  },
  holy_wand: {
    waveform: 'triangle',
    baseFreq: 880,
    endFreq: 1480,
    duration: 0.11,
    gain: 0.18,
    cooldown: 0.08,
    harmonicRatio: 2.0,
  },
  knife: {
    waveform: 'triangle',
    baseFreq: 980,
    endFreq: 420,
    duration: 0.06,
    gain: 0.14,
    cooldown: 0.08,
    noiseGain: 0.12,
    filterFreq: 3200,
    filterType: 'highpass',
  },
  thousand_edge: {
    waveform: 'triangle',
    baseFreq: 1180,
    endFreq: 520,
    duration: 0.055,
    gain: 0.12,
    cooldown: 0.07,
    noiseGain: 0.1,
    filterFreq: 3600,
    filterType: 'highpass',
  },
  axe: {
    waveform: 'sawtooth',
    baseFreq: 240,
    endFreq: 92,
    duration: 0.16,
    gain: 0.2,
    cooldown: 0.11,
    noiseGain: 0.08,
    filterFreq: 900,
    filterType: 'lowpass',
  },
  death_spiral: {
    waveform: 'sawtooth',
    baseFreq: 210,
    endFreq: 74,
    duration: 0.2,
    gain: 0.22,
    cooldown: 0.13,
    noiseGain: 0.12,
    filterFreq: 1100,
    filterType: 'lowpass',
    harmonicRatio: 1.498,
  },
  cross: {
    waveform: 'triangle',
    baseFreq: 587,
    endFreq: 880,
    duration: 0.14,
    gain: 0.17,
    cooldown: 0.11,
    harmonicRatio: 1.5,
  },
  heaven_sword: {
    waveform: 'triangle',
    baseFreq: 660,
    endFreq: 1320,
    duration: 0.17,
    gain: 0.2,
    cooldown: 0.11,
    harmonicRatio: 1.5,
  },
  king_bible: {
    waveform: 'sine',
    baseFreq: 330,
    endFreq: 440,
    duration: 0.22,
    gain: 0.16,
    cooldown: 0.2,
    harmonicRatio: 2.0,
  },
  unholy_vespers: {
    waveform: 'sawtooth',
    baseFreq: 247,
    endFreq: 370,
    duration: 0.24,
    gain: 0.16,
    cooldown: 0.24,
    filterFreq: 1200,
    filterType: 'lowpass',
    harmonicRatio: 1.5,
  },
  fire_wand: {
    waveform: 'sawtooth',
    baseFreq: 190,
    endFreq: 78,
    duration: 0.2,
    gain: 0.2,
    cooldown: 0.12,
    noiseGain: 0.18,
    filterFreq: 750,
    filterType: 'lowpass',
  },
  hellfire: {
    waveform: 'sawtooth',
    baseFreq: 150,
    endFreq: 55,
    duration: 0.28,
    gain: 0.24,
    cooldown: 0.14,
    noiseGain: 0.24,
    filterFreq: 950,
    filterType: 'lowpass',
    harmonicRatio: 1.25,
  },
  garlic: {
    waveform: 'sine',
    baseFreq: 185,
    endFreq: 165,
    duration: 0.14,
    gain: 0.08,
    cooldown: 0.35,
  },
  soul_eater: {
    waveform: 'triangle',
    baseFreq: 164,
    endFreq: 130,
    duration: 0.16,
    gain: 0.1,
    cooldown: 0.32,
    harmonicRatio: 1.5,
  },
  santa_water: {
    waveform: 'sine',
    baseFreq: 540,
    endFreq: 960,
    duration: 0.14,
    gain: 0.16,
    cooldown: 0.14,
    noiseGain: 0.08,
    filterFreq: 1800,
    filterType: 'bandpass',
  },
  la_borra: {
    waveform: 'triangle',
    baseFreq: 480,
    endFreq: 1080,
    duration: 0.18,
    gain: 0.18,
    cooldown: 0.14,
    noiseGain: 0.1,
    filterFreq: 2400,
    filterType: 'bandpass',
    harmonicRatio: 1.5,
  },
  runetracer: {
    waveform: 'square',
    baseFreq: 780,
    endFreq: 340,
    duration: 0.11,
    gain: 0.12,
    cooldown: 0.1,
    filterFreq: 2100,
    filterType: 'lowpass',
  },
  no_future: {
    waveform: 'sawtooth',
    baseFreq: 860,
    endFreq: 290,
    duration: 0.14,
    gain: 0.15,
    cooldown: 0.1,
    noiseGain: 0.1,
    filterFreq: 2400,
    filterType: 'lowpass',
  },
  lightning_ring: {
    waveform: 'sawtooth',
    baseFreq: 1200,
    endFreq: 180,
    duration: 0.14,
    gain: 0.19,
    cooldown: 0.11,
    noiseGain: 0.22,
    filterFreq: 2600,
    filterType: 'bandpass',
  },
  thunder_loop: {
    waveform: 'sawtooth',
    baseFreq: 1440,
    endFreq: 140,
    duration: 0.18,
    gain: 0.22,
    cooldown: 0.11,
    noiseGain: 0.26,
    filterFreq: 3000,
    filterType: 'bandpass',
    harmonicRatio: 1.5,
  },
  pentagram: {
    waveform: 'sawtooth',
    baseFreq: 110,
    endFreq: 440,
    duration: 0.45,
    gain: 0.26,
    cooldown: 0.35,
    filterFreq: 1500,
    filterType: 'lowpass',
    harmonicRatio: 1.5,
  },
  gorgeous_moon: {
    waveform: 'triangle',
    baseFreq: 146.8,
    endFreq: 587.3,
    duration: 0.52,
    gain: 0.26,
    cooldown: 0.35,
    harmonicRatio: 2.0,
  },
  peachone: {
    waveform: 'sine',
    baseFreq: 680,
    endFreq: 440,
    duration: 0.14,
    gain: 0.15,
    cooldown: 0.12,
    harmonicRatio: 1.25,
  },
  ebony_wings: {
    waveform: 'triangle',
    baseFreq: 340,
    endFreq: 220,
    duration: 0.15,
    gain: 0.15,
    cooldown: 0.12,
    harmonicRatio: 1.5,
  },
  vandalier: {
    waveform: 'triangle',
    baseFreq: 520,
    endFreq: 880,
    duration: 0.18,
    gain: 0.19,
    cooldown: 0.12,
    noiseGain: 0.12,
    filterFreq: 1800,
    filterType: 'bandpass',
    harmonicRatio: 1.5,
  },
  phiera: {
    waveform: 'square',
    baseFreq: 620,
    endFreq: 190,
    duration: 0.08,
    gain: 0.14,
    cooldown: 0.08,
    noiseGain: 0.12,
    filterFreq: 2200,
    filterType: 'bandpass',
  },
  eight_sparrow: {
    waveform: 'square',
    baseFreq: 760,
    endFreq: 260,
    duration: 0.08,
    gain: 0.14,
    cooldown: 0.08,
    noiseGain: 0.1,
    filterFreq: 2600,
    filterType: 'bandpass',
  },
  phieraggi: {
    waveform: 'sawtooth',
    baseFreq: 440,
    endFreq: 660,
    duration: 0.2,
    gain: 0.2,
    cooldown: 0.15,
    filterFreq: 2400,
    filterType: 'lowpass',
    harmonicRatio: 2.0,
  },
  bone: {
    waveform: 'triangle',
    baseFreq: 460,
    endFreq: 240,
    duration: 0.08,
    gain: 0.16,
    cooldown: 0.09,
  },
  cherry_bomb: {
    waveform: 'sine',
    baseFreq: 320,
    endFreq: 95,
    duration: 0.18,
    gain: 0.2,
    cooldown: 0.12,
    noiseGain: 0.18,
    filterFreq: 1300,
    filterType: 'lowpass',
  },
  clock_lancet: {
    waveform: 'sine',
    baseFreq: 1046.5,
    endFreq: 1567.98,
    duration: 0.12,
    gain: 0.16,
    cooldown: 0.14,
    harmonicRatio: 2.0,
  },
  laurel: {
    waveform: 'sine',
    baseFreq: 440,
    endFreq: 659.25,
    duration: 0.22,
    gain: 0.15,
    cooldown: 0.25,
    harmonicRatio: 1.5,
  },
};

export const STAGE_BGM_PROFILES: Readonly<Record<BgmTrackId, StageBgmProfile>> = {
  title: {
    bpm: 78,
    rootMidi: 50, // D3
    scaleIntervals: [0, 2, 3, 5, 7, 8, 11, 12],
    bassPattern: [0, 0, -4, -4, -5, -5, -1, -1],
    arpPattern: [0, 2, 4, 6, 7, 4, 2, 4],
    organWaveform: 'sawtooth',
    arpWaveform: 'triangle',
  },
  mad_forest: {
    bpm: 126,
    rootMidi: 50, // D3 minor
    scaleIntervals: [0, 2, 3, 5, 7, 8, 10, 12],
    bassPattern: [0, 0, 3, 3, 5, 5, 4, 2],
    arpPattern: [0, 4, 2, 4, 7, 4, 3, 2],
    organWaveform: 'sawtooth',
    arpWaveform: 'triangle',
  },
  inlaid_library: {
    bpm: 132,
    rootMidi: 49, // C#3 harmonic minor
    scaleIntervals: [0, 2, 3, 5, 7, 8, 11, 12],
    bassPattern: [0, 4, 0, 5, 0, 3, 2, 6],
    arpPattern: [0, 2, 4, 7, 6, 4, 2, 4],
    organWaveform: 'triangle',
    arpWaveform: 'square',
  },
  dairy_plant: {
    bpm: 136,
    rootMidi: 52, // E3 Phrygian
    scaleIntervals: [0, 1, 3, 5, 7, 8, 10, 12],
    bassPattern: [0, 0, 1, 0, 3, 3, 2, 1],
    arpPattern: [0, 1, 4, 3, 7, 4, 1, 3],
    organWaveform: 'sawtooth',
    arpWaveform: 'sawtooth',
  },
  gallo_tower: {
    bpm: 140,
    rootMidi: 54, // F#3 minor
    scaleIntervals: [0, 2, 3, 5, 7, 8, 11, 12],
    bassPattern: [0, 2, 4, 5, 4, 3, 2, 6],
    arpPattern: [0, 4, 7, 4, 5, 2, 6, 4],
    organWaveform: 'triangle',
    arpWaveform: 'triangle',
  },
  cappella_magna: {
    bpm: 146,
    rootMidi: 45, // A2 harmonic minor
    scaleIntervals: [0, 2, 3, 5, 7, 8, 11, 12],
    bassPattern: [0, 0, 5, 5, 3, 3, 6, 4],
    arpPattern: [0, 2, 4, 6, 7, 6, 4, 2],
    organWaveform: 'sawtooth',
    arpWaveform: 'triangle',
  },
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function defaultContextFactory(): AudioContextLike | null {
  if (typeof globalThis === 'undefined') return null;
  const g = globalThis as unknown as {
    AudioContext?: new () => AudioContextLike;
    webkitAudioContext?: new () => AudioContextLike;
  };
  const Ctor = g.AudioContext ?? g.webkitAudioContext;
  if (!Ctor) return null;
  try {
    return new Ctor();
  } catch {
    return null;
  }
}

export class AudioEngine {
  private readonly contextFactory: () => AudioContextLike | null;
  private readonly maxSfxVoices: number;
  private readonly bgmTickIntervalMs: number;

  private ctx: AudioContextLike | null = null;
  private masterGain: GainNodeLike | null = null;
  private bgmBus: GainNodeLike | null = null;
  private sfxBus: GainNodeLike | null = null;
  private noiseBuffer: AudioBufferLike | null = null;

  private bgmVolume = 0.55;
  private sfxVolume = 0.75;
  private muted = false;

  private readonly activeVoices: ActiveVoice[] = [];
  private readonly cooldownUntil = new Map<string, number>();

  private xpStreak = 0;
  private lastXpTime = -999;

  private currentBgm: BgmTrackId | null = null;
  private bgmPaused = false;
  private bgmNextNoteTime = 0;
  private bgmStepIndex = 0;
  private bgmTimer: ReturnType<typeof setInterval> | null = null;

  private playedCount = 0;
  private throttledCount = 0;
  private voiceLimitedCount = 0;
  private bgmNotesScheduled = 0;

  constructor(options: AudioEngineOptions = {}) {
    this.contextFactory = options.contextFactory ?? defaultContextFactory;
    this.maxSfxVoices = Math.max(4, options.maxSfxVoices ?? DEFAULT_MAX_SFX_VOICES);
    this.bgmTickIntervalMs = Math.max(25, options.bgmTickIntervalMs ?? 80);
  }

  public applySettings(
    settings: Pick<AudioAndDisplaySettings, 'bgmVolume' | 'sfxVolume' | 'muted'>,
  ): void {
    this.bgmVolume = clamp01(settings.bgmVolume);
    this.sfxVolume = clamp01(settings.sfxVolume);
    this.muted = Boolean(settings.muted);
    this.syncMixerGains();
  }

  public setBgmVolume(volume: number): void {
    this.bgmVolume = clamp01(volume);
    this.syncMixerGains();
  }

  public setSfxVolume(volume: number): void {
    this.sfxVolume = clamp01(volume);
    this.syncMixerGains();
  }

  public setMuted(muted: boolean): void {
    this.muted = Boolean(muted);
    this.syncMixerGains();
  }

  public getBgmVolume(): number {
    return this.bgmVolume;
  }

  public getSfxVolume(): number {
    return this.sfxVolume;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public getMaxVoices(): number {
    return this.maxSfxVoices;
  }

  public getCurrentStageBgm(): BgmTrackId | null {
    return this.currentBgm;
  }

  public getActiveVoiceCount(): number {
    const now = this.ctx?.currentTime ?? 0;
    this.pruneVoices(now);
    return this.activeVoices.length;
  }

  public getStats(): AudioEngineStats {
    return {
      playedCount: this.playedCount,
      throttledCount: this.throttledCount,
      voiceLimitedCount: this.voiceLimitedCount,
      activeVoices: this.getActiveVoiceCount(),
      bgmNotesScheduled: this.bgmNotesScheduled,
    };
  }

  public async unlock(): Promise<void> {
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        // Ignore browser autoplay rejection until the next user interaction.
      }
    }
  }

  public playCues(cues: readonly AudioCue[]): void {
    for (let i = 0; i < cues.length; i += 1) {
      this.playCue(cues[i]);
    }
  }

  public playCue(cue: AudioCue): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      void this.unlock();
    }
    const now = ctx.currentTime;

    switch (cue.type) {
      case 'xp_gem':
        this.playXpGem(now, cue.tier, cue.streak);
        break;
      case 'hit':
        this.playHit(now, Boolean(cue.crit));
        break;
      case 'weapon_fire':
        this.playWeaponFire(now, cue.weaponId);
        break;
      case 'player_hurt':
        this.playPlayerHurt(now);
        break;
      case 'level_up':
        this.playLevelUp(now);
        break;
      case 'chest_open':
        this.playChestOpen(now, cue.tier, cue.itemCount);
        break;
      case 'chest_reveal':
        this.playChestReveal(now, cue.index, Boolean(cue.isEvolution));
        break;
      case 'evolution':
        this.playEvolution(now);
        break;
      case 'pickup':
        this.playPickup(now, cue.kind);
        break;
      case 'boss_spawn':
        this.playBossSpawn(now);
        break;
      case 'revive':
        this.playRevive(now);
        break;
      case 'game_over':
        this.playGameOver(now, cue.victory);
        break;
      case 'ui_hover':
        this.playUiHover(now);
        break;
      case 'ui_click':
        this.playUiClick(now);
        break;
      case 'ui_buy':
        this.playUiBuy(now);
        break;
      case 'ui_error':
        this.playUiError(now);
        break;
    }
  }

  public startBgm(trackId: BgmTrackId): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    if (this.currentBgm === trackId && !this.bgmPaused && this.bgmTimer !== null) {
      return;
    }

    this.stopBgmTimer();
    this.currentBgm = trackId;
    this.bgmPaused = false;
    this.bgmStepIndex = 0;
    this.bgmNextNoteTime = ctx.currentTime + 0.04;
    this.stepBgm();

    this.bgmTimer = setInterval(() => {
      this.stepBgm();
    }, this.bgmTickIntervalMs);
  }

  public pauseBgm(): void {
    this.bgmPaused = true;
    this.stopBgmTimer();
  }

  public resumeBgm(): void {
    if (!this.currentBgm) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (!this.bgmPaused && this.bgmTimer !== null) return;

    this.bgmPaused = false;
    this.bgmNextNoteTime = ctx.currentTime + 0.04;
    this.stepBgm();
    this.bgmTimer = setInterval(() => {
      this.stepBgm();
    }, this.bgmTickIntervalMs);
  }

  public stopBgm(): void {
    this.currentBgm = null;
    this.bgmPaused = false;
    this.bgmStepIndex = 0;
    this.stopBgmTimer();
  }

  /**
   * Lookahead BGM scheduler step. Exposed publicly so tests can advance scheduling deterministically.
   */
  public stepBgm(): void {
    if (!this.ctx || !this.bgmBus || !this.currentBgm || this.bgmPaused) return;
    const profile = STAGE_BGM_PROFILES[this.currentBgm] ?? STAGE_BGM_PROFILES.mad_forest;
    const stepDuration = 60 / profile.bpm / 2; // eighth-note grid
    const lookaheadHorizon = this.ctx.currentTime + 0.22;

    if (this.bgmNextNoteTime < this.ctx.currentTime - 0.5) {
      this.bgmNextNoteTime = this.ctx.currentTime + 0.02;
    }

    while (this.bgmNextNoteTime < lookaheadHorizon) {
      this.scheduleBgmStep(profile, this.bgmStepIndex, this.bgmNextNoteTime, stepDuration);
      this.bgmNextNoteTime += stepDuration;
      this.bgmStepIndex += 1;
    }
  }

  public dispose(): void {
    this.stopBgm();
    this.activeVoices.length = 0;
    this.cooldownUntil.clear();
    if (this.ctx?.close) {
      void this.ctx.close().catch(() => {});
    }
    this.ctx = null;
    this.masterGain = null;
    this.bgmBus = null;
    this.sfxBus = null;
    this.noiseBuffer = null;
  }

  private ensureContext(): AudioContextLike | null {
    if (this.ctx) return this.ctx;
    const ctx = this.contextFactory();
    if (!ctx) return null;

    this.ctx = ctx;
    this.masterGain = ctx.createGain();
    this.bgmBus = ctx.createGain();
    this.sfxBus = ctx.createGain();

    this.bgmBus.connect(this.masterGain);
    this.sfxBus.connect(this.masterGain);
    this.masterGain.connect(ctx.destination);

    this.syncMixerGains();
    return ctx;
  }

  private syncMixerGains(): void {
    if (!this.ctx || !this.masterGain || !this.bgmBus || !this.sfxBus) return;
    const now = this.ctx.currentTime;
    this.setParamSmooth(this.masterGain.gain, this.muted ? 0 : 1, now);
    this.setParamSmooth(this.bgmBus.gain, this.bgmVolume * 0.45, now);
    this.setParamSmooth(this.sfxBus.gain, this.sfxVolume, now);
  }

  private setParamSmooth(param: AudioParamLike, value: number, now: number): void {
    if (param.setTargetAtTime) {
      param.setTargetAtTime(value, now, 0.015);
    } else {
      param.setValueAtTime(value, now);
    }
    param.value = value;
  }

  private pruneVoices(now: number): void {
    for (let i = this.activeVoices.length - 1; i >= 0; i -= 1) {
      if (this.activeVoices[i].endTime <= now) {
        this.activeVoices.splice(i, 1);
      }
    }
  }

  private canScheduleSfx(
    now: number,
    throttleKey: string,
    cooldownSeconds: number,
    priority: number,
    duration: number,
  ): boolean {
    const nextAllowed = this.cooldownUntil.get(throttleKey) ?? -Infinity;
    if (now < nextAllowed) {
      this.throttledCount += 1;
      return false;
    }

    this.pruneVoices(now);
    const limit = priority >= 8 ? this.maxSfxVoices + HIGH_PRIORITY_HEADROOM : this.maxSfxVoices;
    if (this.activeVoices.length >= limit) {
      if (priority >= 8) {
        let lowestIdx = -1;
        let lowestPriority = priority;
        for (let i = 0; i < this.activeVoices.length; i += 1) {
          if (this.activeVoices[i].priority < lowestPriority) {
            lowestPriority = this.activeVoices[i].priority;
            lowestIdx = i;
          }
        }
        if (lowestIdx >= 0) {
          this.activeVoices.splice(lowestIdx, 1);
        } else {
          this.voiceLimitedCount += 1;
          return false;
        }
      } else {
        this.voiceLimitedCount += 1;
        return false;
      }
    }

    this.cooldownUntil.set(throttleKey, now + cooldownSeconds);
    this.activeVoices.push({
      endTime: now + Math.max(0.03, duration),
      priority,
      category: throttleKey,
    });
    this.playedCount += 1;
    return true;
  }

  private scheduleTone(
    bus: GainNodeLike,
    startTime: number,
    duration: number,
    waveform: OscillatorType,
    startFreq: number,
    endFreq: number,
    peakGain: number,
    filterType?: BiquadFilterType,
    filterFreq?: number,
  ): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = waveform;
    osc.frequency.setValueAtTime(Math.max(20, startFreq), startTime);
    if (endFreq !== startFreq && osc.frequency.exponentialRampToValueAtTime) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), startTime + duration);
    }

    const attack = Math.min(0.012, duration * 0.25);
    gain.gain.setValueAtTime(0.0001, startTime);
    if (gain.gain.linearRampToValueAtTime) {
      gain.gain.linearRampToValueAtTime(Math.max(0.0002, peakGain), startTime + attack);
    }
    if (gain.gain.exponentialRampToValueAtTime) {
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    }

    if (filterType && filterFreq) {
      const filter = this.ctx.createBiquadFilter();
      filter.type = filterType;
      filter.frequency.setValueAtTime(filterFreq, startTime);
      filter.Q.setValueAtTime(1.2, startTime);
      osc.connect(filter);
      filter.connect(gain);
    } else {
      osc.connect(gain);
    }

    gain.connect(bus);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.01);
  }

  private scheduleNoise(
    bus: GainNodeLike,
    startTime: number,
    duration: number,
    peakGain: number,
    filterType: BiquadFilterType,
    filterFreq: number,
  ): void {
    if (!this.ctx) return;
    const buffer = this.ensureNoiseBuffer();
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(filterFreq, startTime);
    filter.Q.setValueAtTime(1.0, startTime);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, startTime);
    if (gain.gain.linearRampToValueAtTime) {
      gain.gain.linearRampToValueAtTime(Math.max(0.0002, peakGain), startTime + 0.004);
    }
    if (gain.gain.exponentialRampToValueAtTime) {
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    }

    source.connect(filter);
    filter.connect(gain);
    gain.connect(bus);
    source.start(startTime);
    source.stop(startTime + duration + 0.01);
  }

  private ensureNoiseBuffer(): AudioBufferLike {
    if (this.noiseBuffer) return this.noiseBuffer;
    const ctx = this.ctx!;
    const length = Math.max(1024, Math.floor(ctx.sampleRate * 0.5));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let seed = 0x13579bdf;
    for (let i = 0; i < length; i += 1) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      data[i] = (seed / 0xffffffff) * 2 - 1;
    }
    this.noiseBuffer = buffer;
    return buffer;
  }

  private playXpGem(
    now: number,
    tier: 'blue' | 'green' | 'red' | 'gold',
    explicitStreak?: number,
  ): void {
    if (!this.sfxBus) return;

    if (!this.canScheduleSfx(now, 'xp_gem', 0.032, 2, 0.12)) {
      return;
    }

    if (now - this.lastXpTime > XP_STREAK_RESET_SECONDS) {
      this.xpStreak = 0;
    } else {
      this.xpStreak = Math.min(24, this.xpStreak + 1);
    }
    if (explicitStreak !== undefined && explicitStreak > this.xpStreak) {
      this.xpStreak = Math.min(24, explicitStreak);
    }
    this.lastXpTime = now;

    const tierOffset = tier === 'blue' ? 0 : tier === 'green' ? 4 : tier === 'red' ? 7 : 12;
    const stepIndex = Math.min(XP_SCALE_SEMITONES.length - 1, this.xpStreak % XP_SCALE_SEMITONES.length);
    const octaveLift = Math.floor(this.xpStreak / XP_SCALE_SEMITONES.length) * 12;
    const midi = 69 + tierOffset + XP_SCALE_SEMITONES[stepIndex] + Math.min(12, octaveLift);
    const freq = midiToHz(midi);

    this.scheduleTone(this.sfxBus, now, 0.11, 'sine', freq, freq * 1.015, 0.14);
    this.scheduleTone(this.sfxBus, now, 0.075, 'triangle', freq * 2, freq * 2.01, 0.05);
  }

  private playHit(now: number, crit: boolean): void {
    if (!this.sfxBus) return;
    const key = crit ? 'hit_crit' : 'hit_normal';
    const cooldown = crit ? 0.055 : 0.045;
    if (!this.canScheduleSfx(now, key, cooldown, crit ? 3 : 2, 0.09)) {
      return;
    }

    if (crit) {
      this.scheduleTone(this.sfxBus, now, 0.085, 'triangle', 540, 165, 0.2);
      this.scheduleTone(this.sfxBus, now, 0.06, 'sine', 1080, 720, 0.09);
      this.scheduleNoise(this.sfxBus, now, 0.05, 0.16, 'bandpass', 2400);
    } else {
      this.scheduleTone(this.sfxBus, now, 0.065, 'triangle', 170, 68, 0.14);
      this.scheduleNoise(this.sfxBus, now, 0.035, 0.08, 'lowpass', 1200);
    }
  }

  private playWeaponFire(now: number, weaponId: WeaponId): void {
    if (!this.sfxBus) return;
    const profile = WEAPON_SYNTH_PROFILES[weaponId] ?? WEAPON_SYNTH_PROFILES.magic_wand;
    const throttleKey = `weapon_${weaponId}`;
    if (!this.canScheduleSfx(now, throttleKey, profile.cooldown, 4, profile.duration)) {
      return;
    }

    this.scheduleTone(
      this.sfxBus,
      now,
      profile.duration,
      profile.waveform,
      profile.baseFreq,
      profile.endFreq,
      profile.gain,
      profile.filterType,
      profile.filterFreq,
    );

    if (profile.harmonicRatio) {
      this.scheduleTone(
        this.sfxBus,
        now,
        profile.duration * 0.85,
        'sine',
        profile.baseFreq * profile.harmonicRatio,
        profile.endFreq * profile.harmonicRatio,
        profile.gain * 0.45,
      );
    }

    if (profile.noiseGain && profile.filterType && profile.filterFreq) {
      this.scheduleNoise(
        this.sfxBus,
        now,
        Math.min(0.16, profile.duration),
        profile.noiseGain,
        profile.filterType,
        profile.filterFreq,
      );
    }
  }

  private playPlayerHurt(now: number): void {
    if (!this.sfxBus) return;
    if (!this.canScheduleSfx(now, 'player_hurt', 0.14, 7, 0.18)) return;
    this.scheduleTone(this.sfxBus, now, 0.16, 'sawtooth', 190, 65, 0.24, 'lowpass', 900);
    this.scheduleNoise(this.sfxBus, now, 0.09, 0.16, 'bandpass', 700);
  }

  private playLevelUp(now: number): void {
    if (!this.sfxBus) return;
    if (!this.canScheduleSfx(now, 'level_up', 0.12, 10, 0.65)) return;
    const notes = [293.66, 440, 587.33, 739.99, 880]; // D major/gothic organ flourish
    for (let i = 0; i < notes.length; i += 1) {
      const start = now + i * 0.065;
      this.scheduleTone(this.sfxBus, start, 0.36, 'triangle', notes[i], notes[i], 0.16);
      this.scheduleTone(this.sfxBus, start, 0.32, 'sine', notes[i] * 0.5, notes[i] * 0.5, 0.12);
    }
  }

  private playChestOpen(now: number, tier: ChestTier, itemCount: 1 | 3 | 5): void {
    if (!this.sfxBus) return;
    const rollHits = itemCount === 1 ? 6 : itemCount === 3 ? 14 : 24;
    const rollDuration = itemCount === 1 ? 0.42 : itemCount === 3 ? 1.05 : 1.9;
    const totalDuration = rollDuration + 0.75;

    if (!this.canScheduleSfx(now, 'chest_open', 0.25, 10, totalDuration)) return;

    // Suspense accelerating snare/timpani drumroll
    for (let i = 0; i < rollHits; i += 1) {
      const tNorm = i / Math.max(1, rollHits - 1);
      const hitTime = now + Math.pow(tNorm, 0.85) * rollDuration;
      const drumPitch = 110 + tNorm * (itemCount === 5 ? 160 : 90);
      const hitGain = 0.09 + tNorm * 0.12;
      this.scheduleTone(this.sfxBus, hitTime, 0.07, 'triangle', drumPitch, drumPitch * 0.65, hitGain);
      this.scheduleNoise(this.sfxBus, hitTime, 0.045, hitGain * 0.65, 'bandpass', 1600 + tNorm * 1400);
    }

    // Rising tension organ swell
    const swellEndFreq = tier === 'arcana' ? 660 : itemCount === 5 ? 587.33 : 440;
    this.scheduleTone(
      this.sfxBus,
      now,
      rollDuration,
      'sawtooth',
      146.83,
      swellEndFreq,
      0.1,
      'lowpass',
      1400,
    );

    // Jackpot fanfare burst after drumroll
    const fanfareStart = now + rollDuration + 0.02;
    const fanfareNotes =
      itemCount === 1
        ? [587.33, 880]
        : itemCount === 3
          ? [440, 587.33, 739.99, 880]
          : [293.66, 440, 587.33, 739.99, 880, 1174.66];

    for (let i = 0; i < fanfareNotes.length; i += 1) {
      const noteTime = fanfareStart + i * 0.065;
      const freq = fanfareNotes[i];
      this.scheduleTone(this.sfxBus, noteTime, 0.48, 'triangle', freq, freq, 0.18);
      if (itemCount >= 3) {
        this.scheduleTone(this.sfxBus, noteTime, 0.44, 'sawtooth', freq * 0.5, freq * 0.5, 0.08, 'lowpass', 1800);
      }
    }
  }

  private playChestReveal(now: number, index: number, isEvolution: boolean): void {
    if (!this.sfxBus) return;
    if (!this.canScheduleSfx(now, 'chest_reveal', 0.05, 9, 0.35)) return;
    const baseMidi = 69 + Math.min(12, index * 3);
    const freq = midiToHz(baseMidi);
    this.scheduleTone(this.sfxBus, now, 0.25, 'triangle', freq, freq * 1.02, 0.18);
    this.scheduleTone(this.sfxBus, now + 0.04, 0.24, 'sine', freq * 1.5, freq * 1.5, 0.12);
    if (isEvolution) {
      this.playEvolutionChord(now + 0.05);
    }
  }

  private playEvolution(now: number): void {
    if (!this.sfxBus) return;
    if (!this.canScheduleSfx(now, 'evolution', 0.2, 10, 0.85)) return;
    this.playEvolutionChord(now);
  }

  private playEvolutionChord(now: number): void {
    if (!this.sfxBus) return;
    const chord = [146.83, 220, 293.66, 369.99, 440, 587.33, 880];
    for (let i = 0; i < chord.length; i += 1) {
      const t = now + i * 0.055;
      this.scheduleTone(this.sfxBus, t, 0.55, 'sawtooth', chord[i], chord[i], 0.12, 'lowpass', 2200);
      this.scheduleTone(this.sfxBus, t, 0.55, 'triangle', chord[i], chord[i], 0.12);
    }
  }

  private playPickup(
    now: number,
    kind: 'coin' | 'gold_bag' | 'chicken' | 'vacuum' | 'rosary' | 'orologion' | 'relic',
  ): void {
    if (!this.sfxBus) return;
    if (!this.canScheduleSfx(now, `pickup_${kind}`, 0.04, 7, 0.35)) return;

    switch (kind) {
      case 'coin':
        this.scheduleTone(this.sfxBus, now, 0.07, 'sine', 987.77, 1318.51, 0.14);
        break;
      case 'gold_bag':
        this.scheduleTone(this.sfxBus, now, 0.08, 'sine', 987.77, 987.77, 0.14);
        this.scheduleTone(this.sfxBus, now + 0.05, 0.09, 'sine', 1318.51, 1318.51, 0.15);
        this.scheduleTone(this.sfxBus, now + 0.1, 0.12, 'sine', 1567.98, 1567.98, 0.16);
        break;
      case 'chicken':
        this.scheduleTone(this.sfxBus, now, 0.1, 'triangle', 392, 523.25, 0.16);
        this.scheduleTone(this.sfxBus, now + 0.07, 0.15, 'sine', 523.25, 783.99, 0.14);
        break;
      case 'vacuum':
        this.scheduleTone(this.sfxBus, now, 0.34, 'sine', 240, 1420, 0.18);
        this.scheduleTone(this.sfxBus, now + 0.03, 0.3, 'triangle', 360, 1760, 0.09);
        break;
      case 'rosary':
        this.scheduleTone(this.sfxBus, now, 0.45, 'triangle', 523.25, 1046.5, 0.18);
        this.scheduleTone(this.sfxBus, now + 0.04, 0.42, 'sine', 659.25, 1318.51, 0.14);
        break;
      case 'orologion':
        this.scheduleTone(this.sfxBus, now, 0.25, 'sine', 1174.66, 587.33, 0.18);
        this.scheduleTone(this.sfxBus, now + 0.12, 0.28, 'triangle', 880, 440, 0.14);
        break;
      case 'relic':
        this.playEvolutionChord(now);
        break;
    }
  }

  private playBossSpawn(now: number): void {
    if (!this.sfxBus) return;
    if (!this.canScheduleSfx(now, 'boss_spawn', 0.5, 10, 0.8)) return;
    this.scheduleTone(this.sfxBus, now, 0.72, 'sawtooth', 73.42, 65.41, 0.24, 'lowpass', 650);
    this.scheduleTone(this.sfxBus, now + 0.08, 0.65, 'triangle', 103.83, 98.0, 0.18); // tritone bell
  }

  private playRevive(now: number): void {
    if (!this.sfxBus) return;
    if (!this.canScheduleSfx(now, 'revive', 0.3, 10, 0.7)) return;
    const notes = [220, 293.66, 440, 587.33, 880];
    for (let i = 0; i < notes.length; i += 1) {
      this.scheduleTone(this.sfxBus, now + i * 0.06, 0.42, 'triangle', notes[i], notes[i] * 1.02, 0.17);
    }
  }

  private playGameOver(now: number, victory: boolean): void {
    if (!this.sfxBus) return;
    if (!this.canScheduleSfx(now, 'game_over', 0.3, 10, 0.9)) return;
    const notes = victory ? [293.66, 369.99, 440, 587.33] : [293.66, 261.63, 220, 146.83];
    for (let i = 0; i < notes.length; i += 1) {
      this.scheduleTone(
        this.sfxBus,
        now + i * 0.16,
        0.48,
        'sawtooth',
        notes[i],
        notes[i],
        0.16,
        'lowpass',
        1500,
      );
    }
  }

  private playUiHover(now: number): void {
    if (!this.sfxBus) return;
    if (!this.canScheduleSfx(now, 'ui_hover', 0.05, 1, 0.035)) return;
    this.scheduleTone(this.sfxBus, now, 0.03, 'sine', 660, 760, 0.06);
  }

  private playUiClick(now: number): void {
    if (!this.sfxBus) return;
    if (!this.canScheduleSfx(now, 'ui_click', 0.04, 7, 0.05)) return;
    this.scheduleTone(this.sfxBus, now, 0.045, 'triangle', 520, 260, 0.14);
  }

  private playUiBuy(now: number): void {
    if (!this.sfxBus) return;
    if (!this.canScheduleSfx(now, 'ui_buy', 0.05, 8, 0.2)) return;
    this.scheduleTone(this.sfxBus, now, 0.09, 'sine', 880, 880, 0.14);
    this.scheduleTone(this.sfxBus, now + 0.06, 0.14, 'triangle', 1318.51, 1318.51, 0.16);
  }

  private playUiError(now: number): void {
    if (!this.sfxBus) return;
    if (!this.canScheduleSfx(now, 'ui_error', 0.06, 7, 0.14)) return;
    this.scheduleTone(this.sfxBus, now, 0.06, 'sawtooth', 165, 130, 0.14, 'lowpass', 600);
    this.scheduleTone(this.sfxBus, now + 0.07, 0.07, 'sawtooth', 145, 110, 0.14, 'lowpass', 600);
  }

  private scheduleBgmStep(
    profile: StageBgmProfile,
    step: number,
    when: number,
    stepDuration: number,
  ): void {
    if (!this.bgmBus) return;

    // Organ pedal bass on quarter-note beats
    if (step % 2 === 0) {
      const bassStep = Math.floor(step / 2) % profile.bassPattern.length;
      const degree = profile.bassPattern[bassStep];
      const bassMidi = this.scaleDegreeToMidi(profile.rootMidi - 12, profile.scaleIntervals, degree);
      const bassHz = midiToHz(bassMidi);
      this.scheduleTone(
        this.bgmBus,
        when,
        stepDuration * 1.85,
        profile.organWaveform,
        bassHz,
        bassHz,
        0.16,
        'lowpass',
        680,
      );
      this.bgmNotesScheduled += 1;
    }

    // Gothic harpsichord / organ arpeggio every eighth note
    const arpDegree = profile.arpPattern[step % profile.arpPattern.length];
    const arpMidi = this.scaleDegreeToMidi(profile.rootMidi + 12, profile.scaleIntervals, arpDegree);
    const arpHz = midiToHz(arpMidi);
    this.scheduleTone(
      this.bgmBus,
      when,
      stepDuration * 0.88,
      profile.arpWaveform,
      arpHz,
      arpHz,
      0.09,
      'lowpass',
      2200,
    );
    this.bgmNotesScheduled += 1;

    // Cathedral fifth bell accent every bar
    if (step % 8 === 0) {
      const accentMidi = this.scaleDegreeToMidi(profile.rootMidi + 24, profile.scaleIntervals, 4);
      const accentHz = midiToHz(accentMidi);
      this.scheduleTone(this.bgmBus, when, stepDuration * 3.2, 'sine', accentHz, accentHz, 0.06);
      this.bgmNotesScheduled += 1;
    }
  }

  private scaleDegreeToMidi(root: number, scale: readonly number[], degree: number): number {
    const len = scale.length - 1;
    const octaveOffset = Math.floor(degree / len) * 12;
    const wrapped = ((degree % len) + len) % len;
    return root + octaveOffset + scale[wrapped];
  }

  private stopBgmTimer(): void {
    if (this.bgmTimer !== null) {
      clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
  }
}

export const ALL_BGM_TRACKS: readonly BgmTrackId[] = ['title', ...STAGE_IDS];
export const ALL_SFX_WEAPONS: readonly WeaponId[] = WEAPON_IDS;
