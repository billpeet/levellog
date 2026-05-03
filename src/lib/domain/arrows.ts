/**
 * Direction-of-fall arrow grid. Walks the IDW raster on a coarser sub-grid
 * and emits arrows pointing in the downhill direction (−∇z), with magnitude
 * encoded by both length and colour.
 *
 * In delta mode the same machinery emits "→ cut direction" arrows: the
 * gradient of (current − finished) points away from the cut, so we still
 * draw `−∇`, but the legend should label it as cut direction rather than
 * fall.
 */

import { sampleGradientCell, type GradientSample } from './gradient';
import type { IdwRaster } from './idw';

export interface ArrowSampleOptions {
	/** Approximate spacing between arrow centres, in plan pixels. */
	spacingPx: number;
	/** Plan scale; arrows are skipped if this isn't set. */
	pxPerMetre: number;
	/**
	 * Slope magnitudes below this threshold (m/m) are dropped — keeps arrows
	 * out of dead-flat regions where direction is meaningless. Default 0.001
	 * (= 0.1%, ~1:1000), well below the resolution of most surveys.
	 */
	minSlope?: number;
}

/**
 * Produce a list of gradient samples on a sub-grid of the raster. Cells whose
 * gradient stencil straddles a NaN-masked neighbour are skipped automatically
 * (so arrows don't appear at the hull boundary). Returned samples include
 * raw slope magnitude — callers map that onto length/colour.
 */
export function sampleArrows(
	raster: IdwRaster,
	options: ArrowSampleOptions
): GradientSample[] {
	const { spacingPx, pxPerMetre, minSlope = 1e-3 } = options;
	if (pxPerMetre <= 0 || spacingPx <= 0) return [];
	const { cols, rows, cellW, cellH } = raster;

	// Convert spacing into a column/row stride; clamp to ≥2 so we always have
	// neighbour cells available for central differences.
	const colStep = Math.max(2, Math.round(spacingPx / cellW));
	const rowStep = Math.max(2, Math.round(spacingPx / cellH));

	const out: GradientSample[] = [];
	for (let r = rowStep; r < rows - 1; r += rowStep) {
		for (let c = colStep; c < cols - 1; c += colStep) {
			const g = sampleGradientCell(raster, c, r, pxPerMetre);
			if (!g) continue;
			if (g.slope < minSlope) continue;
			out.push(g);
		}
	}
	return out;
}

/**
 * Build a colour for an arrow given its slope and the slope range observed
 * across the field. Walks the same palette as the heatmap's sequential ramp
 * so the two layers look like family: muted green → warning amber →
 * accent-deep red as slope climbs.
 */
export function slopeColour(slope: number, slopeMax: number): string {
	if (slopeMax <= 0) return '#6e6a5c';
	const t = Math.max(0, Math.min(1, slope / slopeMax));
	let r: number;
	let g: number;
	let b: number;
	if (t < 0.5) {
		const k = t / 0.5;
		// signal-deep #1f5b41 → warning #c79400
		r = Math.round(0x1f + (0xc7 - 0x1f) * k);
		g = Math.round(0x5b + (0x94 - 0x5b) * k);
		b = Math.round(0x41 + (0x00 - 0x41) * k);
	} else {
		const k = (t - 0.5) / 0.5;
		// warning #c79400 → accent-deep #b6361a
		r = Math.round(0xc7 + (0xb6 - 0xc7) * k);
		g = Math.round(0x94 + (0x36 - 0x94) * k);
		b = Math.round(0x00 + (0x1a - 0x00) * k);
	}
	return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Map slope onto an arrow body length in plan pixels. Linearly scales
 * between minLen and maxLen across the observed slope range so very flat
 * cells get a tiny stub and the steepest cells get a capped maximum.
 */
export function arrowLengthPx(
	slope: number,
	slopeMax: number,
	minLen: number,
	maxLen: number
): number {
	if (slopeMax <= 0) return minLen;
	const t = Math.max(0, Math.min(1, slope / slopeMax));
	return minLen + (maxLen - minLen) * t;
}
