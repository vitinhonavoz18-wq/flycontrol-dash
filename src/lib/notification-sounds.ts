// Notification sound system using WebAudio API (no external mp3 needed).
// Generates distinct tones per event type. Includes a queue so simultaneous
// events play sequentially without overlap.

export type SoundEvent =
  | "new_order"
  | "close_request"
  | "alert"
  | "bill_request"
  | "order_ready"
  | "customer_call"
  | "new_item";

const STORAGE_KEY = "fc_notification_settings_v1";

export type NotificationSettings = {
  enabled: boolean;
  volume: number; // 0..1
};

const defaultSettings: NotificationSettings = { enabled: true, volume: 0.7 };

export function loadSettings(): NotificationSettings {
  if (typeof window === "undefined") return defaultSettings;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSettings;
    const parsed = JSON.parse(raw);
    return {
      enabled: parsed.enabled !== false,
      volume: typeof parsed.volume === "number" ? Math.min(1, Math.max(0, parsed.volume)) : 0.7,
    };
  } catch {
    return defaultSettings;
  }
}

export function saveSettings(s: NotificationSettings) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  window.dispatchEvent(new CustomEvent("fc-notification-settings-changed"));
}

let _ctx: AudioContext | null = null;
let _audioBlocked = false;
let _queue: SoundEvent[] = [];
let _playing = false;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (_ctx) return _ctx;
  try {
    const Ctor: typeof AudioContext =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return null;
    _ctx = new Ctor();
    return _ctx;
  } catch {
    return null;
  }
}

/** Call from a user gesture (button click) to unlock audio after autoplay block. */
export async function unlockAudio(): Promise<boolean> {
  const ctx = getCtx();
  if (!ctx) return false;
  try {
    if (ctx.state === "suspended") await ctx.resume();
    _audioBlocked = false;
    window.dispatchEvent(new CustomEvent("fc-audio-unlocked"));
    return true;
  } catch {
    return false;
  }
}

export function isAudioBlocked(): boolean {
  return _audioBlocked;
}

type Tone = { freq: number; dur: number; type?: OscillatorType; gap?: number };

const PATTERNS: Record<SoundEvent, Tone[]> = {
  // "ding-dong" — short, positive
  new_order: [
    { freq: 880, dur: 0.14, type: "sine" },
    { freq: 660, dur: 0.22, type: "sine", gap: 0.04 },
  ],
  // "ding ding ding" — urgent cash bell
  close_request: [
    { freq: 1320, dur: 0.12, type: "triangle" },
    { freq: 1320, dur: 0.12, type: "triangle", gap: 0.08 },
    { freq: 1760, dur: 0.18, type: "triangle", gap: 0.08 },
  ],
  // Warning buzzer
  alert: [
    { freq: 440, dur: 0.18, type: "square" },
    { freq: 330, dur: 0.18, type: "square", gap: 0.04 },
    { freq: 440, dur: 0.18, type: "square", gap: 0.04 },
  ],
  // Bill / payment request — cash register ding
  bill_request: [
    { freq: 1046, dur: 0.14, type: "triangle" },
    { freq: 1568, dur: 0.20, type: "triangle", gap: 0.05 },
    { freq: 1046, dur: 0.14, type: "triangle", gap: 0.05 },
  ],
  // Order ready — bright upward chime
  order_ready: [
    { freq: 784, dur: 0.12, type: "sine" },
    { freq: 988, dur: 0.12, type: "sine", gap: 0.02 },
    { freq: 1319, dur: 0.22, type: "sine", gap: 0.02 },
  ],
  // Customer calling waiter — attention pulse
  customer_call: [
    { freq: 1200, dur: 0.10, type: "square" },
    { freq: 900, dur: 0.10, type: "square", gap: 0.05 },
    { freq: 1200, dur: 0.10, type: "square", gap: 0.05 },
    { freq: 900, dur: 0.15, type: "square", gap: 0.05 },
  ],
  // New item added to existing order — soft double tap
  new_item: [
    { freq: 660, dur: 0.10, type: "sine" },
    { freq: 880, dur: 0.14, type: "sine", gap: 0.03 },
  ],
};



async function playPattern(event: SoundEvent) {
  const settings = loadSettings();
  if (!settings.enabled) return;
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      _audioBlocked = true;
      window.dispatchEvent(new CustomEvent("fc-audio-blocked"));
      return;
    }
  }

  const master = ctx.createGain();
  master.gain.value = settings.volume;
  master.connect(ctx.destination);

  let t = ctx.currentTime;
  for (const tone of PATTERNS[event]) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = tone.type ?? "sine";
    osc.frequency.setValueAtTime(tone.freq, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(1, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + tone.dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + tone.dur + 0.02);
    t += tone.dur + (tone.gap ?? 0.02);
  }
  // wait until pattern finishes before next in queue
  const totalMs = (t - ctx.currentTime) * 1000 + 50;
  await new Promise((r) => setTimeout(r, totalMs));
}

async function drain() {
  if (_playing) return;
  _playing = true;
  try {
    while (_queue.length) {
      const ev = _queue.shift()!;
      try {
        await playPattern(ev);
      } catch {
        /* ignore */
      }
    }
  } finally {
    _playing = false;
  }
}

export function playSound(event: SoundEvent) {
  _queue.push(event);
  void drain();
}
