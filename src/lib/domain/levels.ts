export function calculateInstrumentHeight(benchmarkElevation: number, benchmarkStaffReading: number) {
	return benchmarkElevation + benchmarkStaffReading;
}

export function calculateReducedLevel(instrumentHeight: number, staffReading: number) {
	return instrumentHeight - staffReading;
}

export type DisplayMode = 'absolute' | 'relative';

/**
 * Format a level value for canvas display.
 *
 * - `absolute` returns the true RL.
 * - `relative` returns `HI − elevation` — i.e. the staff reading the surveyor
 *   would expect to read off the rod against the active session. Negative
 *   values mean the point is above instrument height.
 *
 * Returns the raw signed number; the caller renders sign markers / colour.
 * Falls back to the absolute value if `mode === 'relative'` but `hi` is null,
 * so callers don't have to special-case the no-session path.
 */
export function toDisplayLevel(elevation: number, mode: DisplayMode, hi: number | null): number {
	if (mode === 'relative' && hi != null) {
		return hi - elevation;
	}
	return elevation;
}

/**
 * Format a level value to a fixed-precision string. In relative mode the
 * sign is rendered as a leading arrow (↓ below HI / ↑ above HI) so the value
 * cannot be confused with an absolute RL.
 */
export function formatLevel(
	elevation: number,
	mode: DisplayMode,
	hi: number | null,
	digits = 0
): string {
	const v = toDisplayLevel(elevation, mode, hi);
	const mm = v * 1000;
	if (mode === 'relative' && hi != null) {
		// Surveyor convention: positive (HI - elev > 0) means rod-down from HI,
		// negative means the point is above the instrument.
		const arrow = mm >= 0 ? '↓' : '↑';
		return `${arrow}${Math.abs(mm).toFixed(digits)}`;
	}
	return mm.toFixed(digits);
}

/**
 * Format a *delta* (already a difference of two elevations, e.g. B−A or
 * cut/fill). Deltas are sign-preserving and don't re-express usefully under
 * relative mode, so this is mode-agnostic; included here so callers have a
 * single helper to reach for.
 */
export function formatDelta(delta: number, digits = 0): string {
	const mm = delta * 1000;
	return `${mm >= 0 ? '+' : ''}${mm.toFixed(digits)}`;
}

export function calculateGrade(elevationA: number, elevationB: number, distanceMetres: number) {
	if (distanceMetres === 0) {
		return null;
	}

	const rise = elevationB - elevationA;
	const ratio = rise / distanceMetres;

	return {
		ratio,
		percent: ratio * 100
	};
}
