/**
 * Isoline extraction (marching squares) over an IDW raster, plus the
 * "nice interval" picker that decides at what elevations to draw contours.
 *
 * NaN cells (those outside the sample-cloud hull) are treated as
 * uninformative — any cell whose 2×2 corner stencil includes a NaN is
 * skipped, so contour lines don't snake out into masked regions.
 */

import type { IdwRaster } from './idw';

/**
 * Snap a value range to a "nice" contour interval. Targets ~`targetLines`
 * total lines, then rounds the raw spacing to the nearest 1/2/5 × 10ⁿ.
 *
 * Returns 0 when the range is degenerate (caller should render no contours).
 */
export function niceInterval(range: number, targetLines = 10): number {
	if (!Number.isFinite(range) || range <= 0) return 0;
	const raw = range / targetLines;
	const exp = Math.floor(Math.log10(raw));
	const base = Math.pow(10, exp);
	const mantissa = raw / base;
	let nice: number;
	if (mantissa < 1.5) nice = 1;
	else if (mantissa < 3.5) nice = 2;
	else if (mantissa < 7.5) nice = 5;
	else nice = 10;
	return nice * base;
}

/**
 * The set of contour levels (elevations) to draw, given a value range and
 * the chosen interval. Includes every multiple of `interval` that falls
 * within [min, max] inclusive. Caller can split into "major" (every Nth)
 * and "minor" rendering.
 */
export function contourLevels(min: number, max: number, interval: number): number[] {
	if (interval <= 0 || !Number.isFinite(min) || !Number.isFinite(max) || max <= min) return [];
	const out: number[] = [];
	// Avoid floating drift by working in integer multiples.
	const start = Math.ceil(min / interval);
	const end = Math.floor(max / interval);
	for (let k = start; k <= end; k++) out.push(k * interval);
	return out;
}

export interface ContourSegment {
	level: number;
	/** Polyline in plan-pixel coordinates. Marching squares emits one segment
	 *  per cell; we don't stitch into long chains (SVG renders fine either way). */
	x1: number;
	y1: number;
	x2: number;
	y2: number;
}

/**
 * Extract contour segments at every supplied level via marching squares.
 *
 * Cells with any NaN corner are skipped. Saddle ambiguity (cases 5 & 10) is
 * resolved by averaging the four corners and comparing to the level — the
 * standard "centre-of-cell" disambiguation, good enough for hand-entered
 * surveys where saddles are rare.
 */
export function marchingSquares(
	raster: IdwRaster,
	levels: readonly number[]
): ContourSegment[] {
	const { data, cols, rows, cellW, cellH } = raster;
	if (cols < 2 || rows < 2 || levels.length === 0) return [];

	const out: ContourSegment[] = [];

	for (let r = 0; r < rows - 1; r++) {
		const y0 = (r + 0.5) * cellH;
		const y1 = (r + 1.5) * cellH;
		for (let c = 0; c < cols - 1; c++) {
			const x0 = (c + 0.5) * cellW;
			const x1 = (c + 1.5) * cellW;
			// Corner values: top-left, top-right, bottom-right, bottom-left.
			const tl = data[r * cols + c];
			const tr = data[r * cols + c + 1];
			const br = data[(r + 1) * cols + c + 1];
			const bl = data[(r + 1) * cols + c];
			if (!Number.isFinite(tl) || !Number.isFinite(tr) || !Number.isFinite(br) || !Number.isFinite(bl)) {
				continue;
			}

			for (let li = 0; li < levels.length; li++) {
				const level = levels[li];
				const code =
					(tl >= level ? 8 : 0) |
					(tr >= level ? 4 : 0) |
					(br >= level ? 2 : 0) |
					(bl >= level ? 1 : 0);
				if (code === 0 || code === 15) continue;

				// Linear-interp helpers along each cell edge. Returns plan-pixel coord.
				const top = (): [number, number] => {
					const t = (level - tl) / (tr - tl);
					return [x0 + (x1 - x0) * t, y0];
				};
				const right = (): [number, number] => {
					const t = (level - tr) / (br - tr);
					return [x1, y0 + (y1 - y0) * t];
				};
				const bottom = (): [number, number] => {
					const t = (level - bl) / (br - bl);
					return [x0 + (x1 - x0) * t, y1];
				};
				const left = (): [number, number] => {
					const t = (level - tl) / (bl - tl);
					return [x0, y0 + (y1 - y0) * t];
				};

				const push = (a: [number, number], b: [number, number]) => {
					out.push({ level, x1: a[0], y1: a[1], x2: b[0], y2: b[1] });
				};

				switch (code) {
					case 1:
					case 14:
						push(left(), bottom());
						break;
					case 2:
					case 13:
						push(bottom(), right());
						break;
					case 3:
					case 12:
						push(left(), right());
						break;
					case 4:
					case 11:
						push(top(), right());
						break;
					case 6:
					case 9:
						push(top(), bottom());
						break;
					case 7:
					case 8:
						push(left(), top());
						break;
					case 5: {
						// Saddle: TL & BR above, TR & BL below (or inverse). Disambiguate
						// using the centre-of-cell average.
						const centre = (tl + tr + br + bl) / 4;
						if (centre >= level) {
							push(left(), top());
							push(right(), bottom());
						} else {
							push(left(), bottom());
							push(top(), right());
						}
						break;
					}
					case 10: {
						const centre = (tl + tr + br + bl) / 4;
						if (centre >= level) {
							push(top(), right());
							push(bottom(), left());
						} else {
							push(top(), left());
							push(right(), bottom());
						}
						break;
					}
				}
			}
		}
	}

	return out;
}

/**
 * Group segments by level so callers can stroke them in batches (one path
 * per level) and tag major/minor lines accordingly.
 */
export function groupByLevel(segments: ContourSegment[]): Map<number, ContourSegment[]> {
	const map = new Map<number, ContourSegment[]>();
	for (const s of segments) {
		let arr = map.get(s.level);
		if (!arr) {
			arr = [];
			map.set(s.level, arr);
		}
		arr.push(s);
	}
	return map;
}
