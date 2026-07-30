/**
 * Keeps the screen on while a game is in progress — a scoreboard that dims out mid-turn is
 * useless. Feature-detected: unsupported browsers simply do nothing.
 */
export function keepScreenAwake(): () => void {
	if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return () => {};

	let sentinel: WakeLockSentinel | null = null;
	let released = false;

	const acquire = async () => {
		if (released || document.visibilityState !== 'visible') return;
		try {
			sentinel = await navigator.wakeLock.request('screen');
		} catch {
			// Denied (low battery, or no user activation yet) — not worth surfacing.
		}
	};

	// The lock is dropped whenever the tab is hidden, so re-acquire on the way back.
	const onVisibility = () => {
		if (document.visibilityState === 'visible' && !sentinel) void acquire();
	};

	void acquire();
	document.addEventListener('visibilitychange', onVisibility);

	return () => {
		released = true;
		document.removeEventListener('visibilitychange', onVisibility);
		void sentinel?.release().catch(() => {});
		sentinel = null;
	};
}
