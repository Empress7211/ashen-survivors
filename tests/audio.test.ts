import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ALL_BGM_TRACKS,
  AudioEngine,
  STAGE_BGM_PROFILES,
  WEAPON_SYNTH_PROFILES,
  type AudioBufferLike,
  type AudioBufferSourceNodeLike,
  type AudioContextLike,
  type AudioNodeLike,
  type AudioParamLike,
  type BiquadFilterNodeLike,
  type GainNodeLike,
  type OscillatorNodeLike,
} from '../src/audio/AudioEngine';
import { STAGE_IDS, WEAPON_IDS } from '../src/contracts/ids';
import type { AudioCue } from '../src/contracts/types';

interface RecordedOscillator {
  type: OscillatorType;
  startFreq: number;
  endFreq?: number;
  startTime: number;
  stopTime: number;
  destination: AudioNodeLike | null;
}

class MockAudioParam implements AudioParamLike {
  public value: number;
  public readonly events: Array<{ op: string; value: number; time: number }> = [];

  constructor(initial = 0) {
    this.value = initial;
  }

  setValueAtTime(value: number, startTime: number): void {
    this.value = value;
    this.events.push({ op: 'set', value, time: startTime });
  }

  linearRampToValueAtTime(value: number, endTime: number): void {
    this.value = value;
    this.events.push({ op: 'linear', value, time: endTime });
  }

  exponentialRampToValueAtTime(value: number, endTime: number): void {
    this.value = value;
    this.events.push({ op: 'exp', value, time: endTime });
  }

  setTargetAtTime(target: number, startTime: number, _timeConstant: number): void {
    this.value = target;
    this.events.push({ op: 'target', value: target, time: startTime });
  }
}

class MockGainNode implements GainNodeLike {
  public readonly gain = new MockAudioParam(1);
  public connectedTo: AudioNodeLike[] = [];

  connect(destination: AudioNodeLike): AudioNodeLike {
    this.connectedTo.push(destination);
    return destination;
  }
}

class MockBiquadFilterNode implements BiquadFilterNodeLike {
  public type: BiquadFilterType = 'lowpass';
  public readonly frequency = new MockAudioParam(350);
  public readonly Q = new MockAudioParam(1);
  public connectedTo: AudioNodeLike[] = [];

  connect(destination: AudioNodeLike): AudioNodeLike {
    this.connectedTo.push(destination);
    return destination;
  }
}

class MockOscillatorNode implements OscillatorNodeLike {
  public type: OscillatorType = 'sine';
  public readonly frequency = new MockAudioParam(440);
  public readonly detune = new MockAudioParam(0);
  public destination: AudioNodeLike | null = null;
  public startTime = 0;
  public stopTime = 0;

  constructor(private readonly onStopRecord: (osc: MockOscillatorNode) => void) {}

  connect(destination: AudioNodeLike): AudioNodeLike {
    this.destination = destination;
    return destination;
  }

  start(when = 0): void {
    this.startTime = when;
  }

  stop(when = 0): void {
    this.stopTime = when;
    this.onStopRecord(this);
  }
}

class MockAudioBuffer implements AudioBufferLike {
  private readonly channels: Float32Array[];

  constructor(
    numberOfChannels: number,
    public readonly length: number,
    public readonly sampleRate: number,
  ) {
    this.channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }

  getChannelData(channel: number): Float32Array {
    return this.channels[channel];
  }
}

class MockAudioBufferSourceNode implements AudioBufferSourceNodeLike {
  public buffer: AudioBufferLike | null = null;
  public destination: AudioNodeLike | null = null;
  public startTime = 0;
  public stopTime = 0;

  constructor(private readonly onStop: (src: MockAudioBufferSourceNode) => void) {}

  connect(destination: AudioNodeLike): AudioNodeLike {
    this.destination = destination;
    return destination;
  }

  start(when = 0): void {
    this.startTime = when;
  }

  stop(when = 0): void {
    this.stopTime = when;
    this.onStop(this);
  }
}

class MockAudioContext implements AudioContextLike {
  public state: AudioContextState = 'running';
  public currentTime = 0;
  public readonly sampleRate = 44100;
  public readonly destination: AudioNodeLike = { connect: () => {} };

  public readonly gains: MockGainNode[] = [];
  public readonly oscillators: RecordedOscillator[] = [];
  public readonly noiseSources: MockAudioBufferSourceNode[] = [];
  public resumeCalls = 0;
  public closed = false;

  async resume(): Promise<void> {
    this.resumeCalls += 1;
    this.state = 'running';
  }

  async close(): Promise<void> {
    this.closed = true;
    this.state = 'closed';
  }

  createGain(): GainNodeLike {
    const node = new MockGainNode();
    this.gains.push(node);
    return node;
  }

  createOscillator(): OscillatorNodeLike {
    return new MockOscillatorNode((osc) => {
      const firstFreq = osc.frequency.events.find((e) => e.op === 'set')?.value ?? osc.frequency.value;
      const lastFreq = osc.frequency.events[osc.frequency.events.length - 1]?.value ?? firstFreq;
      this.oscillators.push({
        type: osc.type,
        startFreq: firstFreq,
        endFreq: lastFreq,
        startTime: osc.startTime,
        stopTime: osc.stopTime,
        destination: osc.destination,
      });
    });
  }

  createBiquadFilter(): BiquadFilterNodeLike {
    return new MockBiquadFilterNode();
  }

  createBuffer(numberOfChannels: number, length: number, sampleRate: number): AudioBufferLike {
    return new MockAudioBuffer(numberOfChannels, length, sampleRate);
  }

  createBufferSource(): AudioBufferSourceNodeLike {
    return new MockAudioBufferSourceNode((src) => {
      this.noiseSources.push(src);
    });
  }
}

const enginesToDispose: AudioEngine[] = [];

function createTestAudio(options?: { maxSfxVoices?: number; suspended?: boolean }) {
  const ctx = new MockAudioContext();
  if (options?.suspended) {
    ctx.state = 'suspended';
  }
  const engine = new AudioEngine({
    contextFactory: () => ctx,
    maxSfxVoices: options?.maxSfxVoices ?? 24,
    bgmTickIntervalMs: 50,
  });
  enginesToDispose.push(engine);
  return { ctx, engine };
}

afterEach(() => {
  while (enginesToDispose.length > 0) {
    enginesToDispose.pop()?.dispose();
  }
  vi.useRealTimers();
});

describe('AudioEngine', () => {
  it('handles missing Web Audio context safely in headless/SSR environments', async () => {
    const engine = new AudioEngine({ contextFactory: () => null });
    enginesToDispose.push(engine);

    await expect(engine.unlock()).resolves.toBeUndefined();
    expect(() => {
      engine.setBgmVolume(0.4);
      engine.setSfxVolume(0.8);
      engine.setMuted(true);
      engine.playCue({ type: 'level_up', level: 2 });
      engine.playCues([{ type: 'hit', crit: true }, { type: 'xp_gem', tier: 'blue' }]);
      engine.startBgm('mad_forest');
      engine.pauseBgm();
      engine.resumeBgm();
      engine.stopBgm();
    }).not.toThrow();
    expect(engine.getActiveVoiceCount()).toBe(0);
  });

  it('maintains separate BGM/SFX gain buses, clamping, mute state, and auto-unlock', async () => {
    const { ctx, engine } = createTestAudio({ suspended: true });

    engine.applySettings({ bgmVolume: 0.8, sfxVolume: 0.4, muted: false });
    engine.playCue({ type: 'ui_click' });

    expect(ctx.resumeCalls).toBeGreaterThanOrEqual(1);
    // gains[0] = masterGain, gains[1] = bgmBus, gains[2] = sfxBus
    const masterGain = ctx.gains[0];
    const bgmBus = ctx.gains[1];
    const sfxBus = ctx.gains[2];

    expect(masterGain.gain.value).toBe(1);
    expect(bgmBus.gain.value).toBeCloseTo(0.8 * 0.45, 4);
    expect(sfxBus.gain.value).toBeCloseTo(0.4, 4);

    engine.setMuted(true);
    expect(masterGain.gain.value).toBe(0);
    expect(engine.getBgmVolume()).toBeCloseTo(0.8);
    expect(engine.getSfxVolume()).toBeCloseTo(0.4);

    engine.setBgmVolume(1.7);
    engine.setSfxVolume(-0.2);
    expect(engine.getBgmVolume()).toBe(1);
    expect(engine.getSfxVolume()).toBe(0);

    engine.setMuted(false);
    expect(masterGain.gain.value).toBe(1);
    expect(bgmBus.gain.value).toBeCloseTo(0.45, 4);
    expect(sfxBus.gain.value).toBe(0);
  });

  it('throttles and voice-limits a 1,200-enemy combat flood while preserving high-priority cues', () => {
    const { ctx, engine } = createTestAudio({ maxSfxVoices: 10 });

    const massiveBurst: AudioCue[] = [];
    for (let i = 0; i < 600; i += 1) {
      massiveBurst.push({ type: 'hit', crit: i % 5 === 0 });
      massiveBurst.push({ type: 'xp_gem', tier: i % 4 === 0 ? 'green' : 'blue' });
    }
    for (const weaponId of WEAPON_IDS) {
      massiveBurst.push({ type: 'weapon_fire', weaponId });
    }

    engine.playCues(massiveBurst);

    const statsAfterBurst = engine.getStats();
    // Should never exceed maxSfxVoices for normal/low priority combat sounds
    expect(statsAfterBurst.activeVoices).toBeLessThanOrEqual(10);
    expect(statsAfterBurst.throttledCount).toBeGreaterThan(1100);
    expect(statsAfterBurst.voiceLimitedCount).toBeGreaterThan(0);

    // High-priority level_up & chest_open must still schedule cleanly even at voice cap
    const oscBefore = ctx.oscillators.length;
    engine.playCue({ type: 'level_up', level: 12 });
    engine.playCue({ type: 'chest_open', tier: 'gold', itemCount: 5 });
    expect(ctx.oscillators.length).toBeGreaterThan(oscBefore);
    expect(engine.getActiveVoiceCount()).toBeLessThanOrEqual(14); // 10 + HIGH_PRIORITY_HEADROOM(4)

    // Voices expire cleanly as audio clock moves forward
    ctx.currentTime += 5.0;
    expect(engine.getActiveVoiceCount()).toBe(0);
  });

  it('climbs pitch across consecutive XP gem pickups and resets after silence', () => {
    const { ctx, engine } = createTestAudio();

    const freqs: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      const before = ctx.oscillators.length;
      engine.playCue({ type: 'xp_gem', tier: 'blue' });
      freqs.push(ctx.oscillators[before].startFreq);
      ctx.currentTime += 0.06;
    }

    for (let i = 1; i < freqs.length; i += 1) {
      expect(freqs[i]).toBeGreaterThan(freqs[i - 1]);
    }

    // Gap > XP_STREAK_RESET_SECONDS resets streak to base pitch
    ctx.currentTime += 0.8;
    const beforeReset = ctx.oscillators.length;
    engine.playCue({ type: 'xp_gem', tier: 'blue' });
    expect(ctx.oscillators[beforeReset].startFreq).toBeCloseTo(freqs[0], 2);

    // Gold XP tier starts higher than blue XP tier
    ctx.currentTime += 0.8;
    const beforeGold = ctx.oscillators.length;
    engine.playCue({ type: 'xp_gem', tier: 'gold' });
    expect(ctx.oscillators[beforeGold].startFreq).toBeGreaterThan(freqs[0]);
  });

  it('synthesizes distinct weapon-specific SFX for all 34 canonical weapons', () => {
    const { ctx, engine } = createTestAudio({ maxSfxVoices: 64 });

    expect(Object.keys(WEAPON_SYNTH_PROFILES).sort()).toEqual([...WEAPON_IDS].sort());

    for (let i = 0; i < WEAPON_IDS.length; i += 1) {
      const weaponId = WEAPON_IDS[i];
      const before = ctx.oscillators.length;
      engine.playCue({ type: 'weapon_fire', weaponId });
      expect(ctx.oscillators.length).toBeGreaterThan(before);
      ctx.currentTime += 0.5;
    }
  });

  it('scales Treasure Chest suspense drumroll and jackpot fanfare across 1, 3, and 5 items', () => {
    const { ctx, engine } = createTestAudio({ maxSfxVoices: 32 });

    const runChest = (itemCount: 1 | 3 | 5) => {
      const startIdx = ctx.oscillators.length;
      engine.playCue({ type: 'chest_open', tier: itemCount === 5 ? 'gold' : 'bronze', itemCount });
      const added = ctx.oscillators.slice(startIdx);
      const maxStop = Math.max(...added.map((o) => o.stopTime - ctx.currentTime));
      ctx.currentTime += 4.0;
      return { count: added.length, span: maxStop };
    };

    const one = runChest(1);
    const three = runChest(3);
    const five = runChest(5);

    expect(three.count).toBeGreaterThan(one.count);
    expect(five.count).toBeGreaterThan(three.count);
    expect(three.span).toBeGreaterThan(one.span);
    expect(five.span).toBeGreaterThan(three.span);
  });

  it('triggers all non-weapon gameplay and UI cues without errors', () => {
    const { ctx, engine } = createTestAudio({ maxSfxVoices: 32 });

    const cues: AudioCue[] = [
      { type: 'player_hurt' },
      { type: 'chest_reveal', index: 2, isEvolution: true },
      { type: 'evolution' },
      { type: 'pickup', kind: 'coin' },
      { type: 'pickup', kind: 'gold_bag' },
      { type: 'pickup', kind: 'chicken' },
      { type: 'pickup', kind: 'vacuum' },
      { type: 'pickup', kind: 'rosary' },
      { type: 'pickup', kind: 'orologion' },
      { type: 'pickup', kind: 'relic' },
      { type: 'boss_spawn', enemyId: 'boss_giant_bat' },
      { type: 'revive' },
      { type: 'game_over', victory: true },
      { type: 'game_over', victory: false },
      { type: 'ui_hover' },
      { type: 'ui_click' },
      { type: 'ui_buy' },
      { type: 'ui_error' },
    ];

    for (const cue of cues) {
      const before = ctx.oscillators.length;
      engine.playCue(cue);
      expect(ctx.oscillators.length).toBeGreaterThan(before);
      ctx.currentTime += 1.0;
    }
  });

  it('schedules atmospheric dark-gothic organ/arpeggio BGM per stage and cleans up timers', () => {
    vi.useFakeTimers();
    const { ctx, engine } = createTestAudio();

    // Every stage + title has its own BGM profile
    for (const stageId of STAGE_IDS) {
      expect(STAGE_BGM_PROFILES[stageId]).toBeDefined();
    }
    expect(ALL_BGM_TRACKS).toEqual(['title', ...STAGE_IDS]);

    engine.startBgm('inlaid_library');
    expect(engine.getCurrentStageBgm()).toBe('inlaid_library');
    const initialNotes = engine.getStats().bgmNotesScheduled;
    expect(initialNotes).toBeGreaterThan(0);

    // Advance audio clock + interval timers
    ctx.currentTime += 0.6;
    vi.advanceTimersByTime(100);
    const afterAdvanceNotes = engine.getStats().bgmNotesScheduled;
    expect(afterAdvanceNotes).toBeGreaterThan(initialNotes);

    // Switching stage track keeps running cleanly
    engine.startBgm('cappella_magna');
    expect(engine.getCurrentStageBgm()).toBe('cappella_magna');

    // Pause suspends scheduling; resume restarts
    engine.pauseBgm();
    const pausedNotes = engine.getStats().bgmNotesScheduled;
    ctx.currentTime += 0.6;
    vi.advanceTimersByTime(150);
    expect(engine.getStats().bgmNotesScheduled).toBe(pausedNotes);

    engine.resumeBgm();
    ctx.currentTime += 0.4;
    vi.advanceTimersByTime(100);
    expect(engine.getStats().bgmNotesScheduled).toBeGreaterThan(pausedNotes);

    engine.stopBgm();
    expect(engine.getCurrentStageBgm()).toBeNull();
    engine.dispose();
    expect(ctx.closed).toBe(true);
  });
});
