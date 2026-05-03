/**
 * Central-difference gradient sampling on the IDW raster, plus slope helpers.
 * Slope magnitude is reported in metres per metre (dimensionless), matching
 * the units used by the existing grade tool — call sites can format as `%`
 * or `1:n` ratio with the same helpers in `levels.ts`.
 *
 * Pure / framework-free.
 */

import type { IdwRaster } from './idw';

export interface GradientSample {
	/** Plan-pixel position of the sample. */
	x: number;
	y: number;
	/** Downhill direction unit vector (−∇z, normalised). NaN components when slope is ~0. */
	dx: number;
	dy: number;
	/** Slope magnitude in metres per metre (m of fall per m of horizontal travel). */
	slope: number;
	/** Interpolated raster value at (x, y). Useful for delta-mode tinting. */
	value: number;
}

/**
 * Sample the gradient (∂z/∂x, ∂z/∂y) of an IDW raster at the centre of cell
 * (col, row) using central differences. Returns null if any of the four
 * neighbour cells is outside the grid or NaN-masked.
 *
 * `pxPerMetre` converts the per-pixel derivative into per-metre slope so the
 * caller gets a real-world ratio.
 */
export function sampleGradientCell(
	raster: IdwRaster,
	col: number,
	row: number,
	pxPerMetre: number
): GradientSample | null {
	const { data, cols, rows, cellW, cellH } = raster;
	if (col <= 0 || col >= cols - 1 || row <= 0 || row >= rows - 1) return null;
	if (pxPerMetre <= 0) return null;

	const here = data[row * cols + col];
	const left = data[row * cols + (col - 1)];
	const right = data[row * cols + (col + 1)];
	const up = data[(row - 1) * cols + col];
	const down = data[(row + 1) * cols + col];

	if (
		!Number.isFinite(here) ||
		!Number.isFinite(left) ||
		!Number.isFinite(right) ||
		!Number.isFinite(up) ||
		!Number.isFinite(down)
	) {
		return null;
	}

	// ∂z/∂x in metres-per-metre. Cell width is in pixels, so:
	//   dz/dx_px = (right - left) / (2 * cellW)        [metres per pixel]
	//   dz/dx_m  = dz/dx_px * pxPerMetre               [metres per metre]
	const dzdx = ((right - left) / (2 * cellW)) * pxPerMetre;
	const dzdy = ((down - up) / (2 * cellH)) * pxPerMetre;

	const slope = Math.hypot(dzdx, dzdy);
	// Downhill direction is −∇z, normalised. NaN dx/dy is fine for flat cells —
	// callers should drop arrows where slope < some threshold anyway.
	const inv = slope > 0 ? 1 / slope : NaN;
	const dx = -dzdx * inv;
	const dy = -dzdy * inv;

	return {
		x: (col + 0.5) * cellW,
		y: (row + 0.5) * cellH,
		dx,
		dy,
		slope,
		value: here
	};
}

/**
 * Pretty `1:n` ratio for a slope magnitude. Returns null when slope is ~0
 * (the ratio would be infinite). Matches the formatting used by the grade
 * tool legend.
 */
export function slopeRatio(slope: number): number | null {
	if (!Number.isFinite(slope) || slope <= 1e-6) return null;
	return 1 / slope;
}
