import { useStore } from './store';

type Feedback = 'confirm' | 'add' | 'refresh';

/** Soft synthesized UI cue; never creates audio or plays anything until the user opts in. */
export function playFeedback(kind: Feedback) {
  if (typeof window === 'undefined' || !useStore.getState().settings.sounds) return;
  try {
    const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    const context = new AudioContextCtor();
    const now = context.currentTime;
    const frequencies = kind === 'confirm' ? [523.25, 659.25] : kind === 'add' ? [440, 554.37] : [392, 523.25];
    frequencies.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, now + index * 0.065);
      gain.gain.exponentialRampToValueAtTime(0.035, now + index * 0.065 + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.065 + 0.13);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now + index * 0.065);
      oscillator.stop(now + index * 0.065 + 0.14);
    });
    window.setTimeout(() => { void context.close().catch(() => undefined); }, 400);
  } catch { /* Audio is an optional enhancement; never block the UI. */ }
}
