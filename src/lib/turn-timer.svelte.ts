import {
	clickStart,
	startAlarm,
	stopAlarm,
	unlockAudio,
	vibrate,
	warnFinal,
	warnHalfway
} from './audio';

export interface TimerOptions {
	seconds: number;
	/** Seconds remaining at which to sound a warning, e.g. [30, 10]. */
	warnAt: number[];
	sound: boolean;
	haptics: boolean;
}

/**
 * The turn clock. Driven by requestAnimationFrame against `performance.now()` rather than
 * setInterval, so a throttled or backgrounded tab resumes at the true elapsed time instead of
 * accumulating drift or replaying missed ticks.
 */
export class TurnTimer {
	#options: TimerOptions;
	#frame: number | null = null;
	#deadline = 0;
	/**
	 * Warning thresholds already sounded this turn — a pause/resume must not re-fire them. A plain
	 * array, not a Set: it holds at most a couple of entries and is never read reactively.
	 */
	#fired: number[] = [];

	remainingMs = $state(0);
	running = $state(false);
	expired = $state(false);
	/** Announced to screen readers when a warning fires. */
	announcement = $state('');

	constructor(options: TimerOptions) {
		this.#options = options;
		this.remainingMs = options.seconds * 1000;
	}

	get totalMs(): number {
		return this.#options.seconds * 1000;
	}

	/** Seconds past zero, for the overtime readout. */
	get overtimeMs(): number {
		return this.remainingMs < 0 ? -this.remainingMs : 0;
	}

	get fraction(): number {
		return Math.max(0, Math.min(1, this.remainingMs / this.totalMs));
	}

	configure(options: TimerOptions) {
		const lengthChanged = options.seconds !== this.#options.seconds;
		this.#options = options;
		if (!options.sound) stopAlarm();
		if (lengthChanged && !this.running) this.reset();
	}

	start = () => {
		if (this.running) return;
		// The AudioContext can only be created inside a user gesture, which this always is.
		if (this.#options.sound) {
			unlockAudio();
			clickStart();
		}
		this.#deadline = performance.now() + this.remainingMs;
		this.running = true;
		this.#tick();
	};

	pause = () => {
		if (!this.running) return;
		this.running = false;
		this.#cancel();
		stopAlarm();
	};

	toggle = () => {
		if (this.running) this.pause();
		else this.start();
	};

	/** Back to a full turn, silent — used when moving to the next player and on reset. */
	reset = () => {
		this.#cancel();
		stopAlarm();
		this.running = false;
		this.expired = false;
		this.remainingMs = this.totalMs;
		this.#fired = [];
		this.announcement = '';
	};

	/** Reset and immediately run, for "Next player". */
	restart = () => {
		this.reset();
		this.start();
	};

	destroy = () => {
		this.#cancel();
		stopAlarm();
	};

	#cancel() {
		if (this.#frame !== null) {
			cancelAnimationFrame(this.#frame);
			this.#frame = null;
		}
	}

	#tick = () => {
		if (!this.running) return;

		const previous = this.remainingMs;
		this.remainingMs = this.#deadline - performance.now();

		// Fire on the crossing, not on equality — a frame can skip straight past a threshold.
		for (const seconds of this.#options.warnAt) {
			const threshold = seconds * 1000;
			if (previous > threshold && this.remainingMs <= threshold && !this.#fired.includes(seconds)) {
				this.#fired.push(seconds);
				this.announcement = `${seconds} seconds left`;
				if (this.#options.sound) {
					if (seconds <= 10) warnFinal();
					else warnHalfway();
				}
				if (this.#options.haptics) vibrate(seconds <= 10 ? [90, 60, 90] : 70);
			}
		}

		if (previous > 0 && this.remainingMs <= 0 && !this.expired) {
			this.expired = true;
			this.announcement = "Time's up";
			if (this.#options.sound) startAlarm();
			if (this.#options.haptics) vibrate([220, 120, 220, 120, 220]);
		}

		this.#frame = requestAnimationFrame(this.#tick);
	};
}

/** mm:ss from a positive millisecond count. */
export function formatClock(ms: number): string {
	const total = Math.max(0, Math.ceil(ms / 1000));
	const minutes = Math.floor(total / 60);
	const seconds = total % 60;
	return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
