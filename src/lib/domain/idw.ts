import { pointInPolygon, type Pt } from './hull';

export interface IdwSample {
	x: number;
	y: number;
	value: number;
}

/**
 * Inverse-distance weighted interpolation at a single point.
 * Uses 1/d² weighting (power = 2). Returns null if no samples.
 */
export function interpolateIdw(x: number, y: number, samples: IdwSample[]) {
	if (samples.length === 0) {
		return null;
	}

	let weightedSum = 0;
	let totalWeight = 0;

	for (const sample of samples) {
		const dx = sample.x - x;
		const dy = sample.y - y;
		const distanceSquared = dx * dx + dy * dy;

		if (distanceSquared === 0) {
			return sample.value;
		}

		const weight = 1 / distanceSquared;
		weightedSum += weight * sample.value;
		totalWeight += weight;
	}

	return totalWeight === 0 ? null : weightedSum / totalWeight;
}

export interface RasterizeOptions {
	/** Optional convex polygon (sample-cloud hull). Cells whose centre falls
	 *  outside it are written as NaN so downstream layers can mask them. */
	hull?: readonly Pt[] | null;
}

export interface IdwRaster {
	/** Row-major value grid. Cells outside the hull (when supplied) are NaN. */
	data: Float32Array;
	cols: number;
	rows: number;
	/** Plan-pixel cell dimensions; useful for sub-cell interpolation. */
	cellW: number;
	cellH: number;
	/** Min/max of finite cells only. ±Infinity when no cells survived the mask. */
	min: number;
	max: number;
}

/**
 * Sample IDW into a (cols × rows) grid that spans (0,0) → (width, height) in
 * plan-pixel coordinates. The grid is row-major. Min/max cover finite cells
 * only — masked cells (when a hull is supplied) hold NaN.
 */
export function rasterizeIdw(
	samples: IdwSample[],
	width: number,
	height: number,
	cols: number,
	rows: number,
	options: RasterizeOptions = {}
): IdwRaster | null {
	if (samples.length === 0 || cols <= 0 || rows <= 0) return null;

	const data = new Float32Array(cols * rows);
	const cellW = width / cols;
	const cellH = height / rows;
	const hull = options.hull && options.hull.length >= 3 ? options.hull : null;
	let min = Infinity;
	let max = -Infinity;

	for (let r = 0; r < rows; r++) {
		const cy = (r + 0.5) * cellH;
		for (let c = 0; c < cols; c++) {
			const cx = (c + 0.5) * cellW;

			if (hull && !pointInPolygon(cx, cy, hull)) {
				data[r * cols + c] = NaN;
				continue;
			}

			let weightedSum = 0;
			let totalWeight = 0;
			let snappedValue = NaN;

			for (let i = 0; i < samples.length; i++) {
				const s = samples[i];
				const dx = s.x - cx;
				const dy = s.y - cy;
				const d2 = dx * dx + dy * dy;
				if (d2 < 1e-6) {
					snappedValue = s.value;
					break;
				}
				const w = 1 / d2;
				weightedSum += w * s.value;
				totalWeight += w;
			}

			const v = Number.isFinite(snappedValue)
				? snappedValue
				: totalWeight > 0
					? weightedSum / totalWeight
					: 0;

			data[r * cols + c] = v;
			if (v < min) min = v;
			if (v > max) max = v;
		}
	}

	return { data, cols, rows, cellW, cellH, min, max };
}
