/**
 * Every sound the turn clock makes is synthesised with oscillators — there are no audio files to
 * ship, cache, or fail to load offline.
 */

let context: AudioContext | null = null;
let alarmHandle: ReturnType<typeof setInterval> | null = null;

/**
 * Must be called from a user gesture (the Start button). Mobile browsers refuse to start an
 * AudioContext otherwise, and a context created too early stays permanently suspended.
 */
export function unlockAudio(): void {
	if (typeof window === 'undefined') return;
	const Ctor =
		window.AudioContext ??
		(window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
	if (!Ctor) return;
	context ??= new Ctor();
	if (context.state === 'suspended') void context.resume();
}

interface ToneOptions {
	freq: number;
	/** Seconds from now. */
	at?: number;
	duration?: number;
	gain?: number;
	type?: OscillatorType;
}

function tone({
	freq,
	at = 0,
	duration = 0.12,
	gain = 0.22,
	type = 'triangle'
}: ToneOptions): void {
	if (!context || context.state !== 'running') return;

	const start = context.currentTime + at;
	const osc = context.createOscillator();
	const envelope = context.createGain();

	osc.type = type;
	osc.frequency.setValueAtTime(freq, start);

	// A short attack/decay ramp — a raw gate on a square edge clicks audibly.
	envelope.gain.setValueAtTime(0, start);
	envelope.gain.linearRampToValueAtTime(gain, start + 0.012);
	envelope.gain.setValueAtTime(gain, start + duration - 0.03);
	envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);

	osc.connect(envelope).connect(context.destination);
	osc.start(start);
	osc.stop(start + duration + 0.02);
}

/** Two calm mid beeps: plenty of time left, just a nudge. */
export function warnHalfway(): void {
	tone({ freq: 660, at: 0 });
	tone({ freq: 660, at: 0.18 });
}

/** Three faster, higher beeps: wrap it up. */
export function warnFinal(): void {
	tone({ freq: 880, at: 0, duration: 0.1 });
	tone({ freq: 880, at: 0.14, duration: 0.1 });
	tone({ freq: 990, at: 0.28, duration: 0.14 });
}

/** A single urgent two-tone bleat, repeated until `stopAlarm`. */
function alarmBurst(): void {
	tone({ freq: 520, at: 0, duration: 0.18, gain: 0.3, type: 'square' });
	tone({ freq: 392, at: 0.2, duration: 0.24, gain: 0.3, type: 'square' });
}

export function startAlarm(): void {
	stopAlarm();
	alarmBurst();
	alarmHandle = setInterval(alarmBurst, 900);
}

export function stopAlarm(): void {
	if (alarmHandle) {
		clearInterval(alarmHandle);
		alarmHandle = null;
	}
}

export function isAlarming(): boolean {
	return alarmHandle !== null;
}

/** A soft confirmation for starting a turn. */
export function clickStart(): void {
	tone({ freq: 440, duration: 0.07, gain: 0.14 });
}

export function vibrate(pattern: number | number[]): void {
	if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
		try {
			navigator.vibrate(pattern);
		} catch {
			// Some browsers expose vibrate but throw outside a user gesture; the beep still fires.
		}
	}
}
