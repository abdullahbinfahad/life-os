import { useStore } from './store';

type Feedback = 'confirm' | 'add' | 'refresh' | 'pause' | 'resume' | 'count' | 'submit' | 'failed' | 'popup' | 'notification';
let lastFeedbackAt = 0;

const soundNotes: Record<Feedback, number[]> = {
  confirm: [523, 659],
  add: [440, 554],
  refresh: [392, 523],
  pause: [494],
  resume: [523, 659],
  count: [659, 784],
  submit: [587, 740],
  failed: [330, 262],
  popup: [587],
  notification: [659, 880],
};

/** Short, soft synthesized cues for meaningful events only; opt-in through Settings. */
export function playFeedback(kind: Feedback) {
  if (typeof window === 'undefined' || !useStore.getState().settings.sounds) return;
  const nowMs = Date.now();
  if (nowMs - lastFeedbackAt < 90) return;
  lastFeedbackAt = nowMs;
  try {
    const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    const context = new AudioContextCtor();
    if (context.state === 'suspended') void context.resume().catch(() => undefined);
    const now = context.currentTime;
    soundNotes[kind].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const startAt = now + index * 0.075;
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, startAt);
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(0.018, startAt + 0.022);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.12);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(startAt);
      oscillator.stop(startAt + 0.13);
    });
    window.setTimeout(() => { void context.close().catch(() => undefined); }, 400);
  } catch { /* Audio is an optional enhancement; never block the UI. */ }
}
