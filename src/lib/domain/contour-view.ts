/**
 * Composes the contour-view pipeline end-to-end: padded sample hull → IDW
 * raster (NaN outside hull) → marching-squares segments + fall arrows.
 *
 * Kept separate from the building blocks so the project page's $derived
 * layer stays declarative.
 */

import { sampleArrows, type ArrowSampleOptions } from './arrows';
import { contourLevels, marchingSquares, niceInterval, type ContourSegment } from './contours';
import type { GradientSample } from './gradient';
import { buildSampleHull, type Pt } from './hull';
import { rasterizeIdw, type IdwRaster, type IdwSample } from './idw';

export interface ContourViewOptions {
	samples: IdwSample[];
	width: number;
	height: number;
	/** Plan scale; required for arrows (slope is in m/m). When null, arrows
	 *  are skipped but contour lines still render. */
	pxPerMetre: number | null;
	/** Target raster columns. Rows scale with plan aspect. */
	cols?: number;
	/** Spacing between arrow centres in plan pixels. */
	arrowSpacingPx?: number;
	/** Override the contour interval. When omitted we auto-snap via niceInterval(). */
	interval?: number;
}

export interface ContourView {
	/** Hull used to mask the raster (already padded). May span the whole plan
	 *  for tiny clouds — callers should treat null as "don't render". */
	hull: Pt[];
	raster: IdwRaster;
	interval: number;
	/** All contour-line elevations within [min, max]. */
	levels: number[];
	segments: ContourSegment[];
	arrows: GradientSample[];
	/** Maximum slope across the arrow set; used to scale length/colour. */
	slopeMax: number;
	min: number;
	max: number;
}

export function buildContourView(opts: ContourViewOptions): ContourView | null {
	if (opts.samples.length < 3) return null;
	if (opts.width <= 0 || opts.height <= 0) return null;

	const hull = buildSampleHull(opts.samples);
	if (!hull) return null;

	const cols = Math.max(20, Math.min(240, opts.cols ?? 140));
	const rows = Math.max(20, Math.round(cols * (opts.height / opts.width)));

	const raster = rasterizeIdw(opts.samples, opts.width, opts.height, cols, rows, { hull });
	if (!raster) return null;
	if (!Number.isFinite(raster.min) || !Number.isFinite(raster.max)) return null;

	const range = raster.max - raster.min;
	const interval = opts.interval ?? niceInterval(range);
	const levels = interval > 0 ? contourLevels(raster.min, raster.max, interval) : [];
	const segments = marchingSquares(raster, levels);

	let arrows: GradientSample[] = [];
	let slopeMax = 0;
	if (opts.pxPerMetre && opts.pxPerMetre > 0) {
		const arrowOpts: ArrowSampleOptions = {
			spacingPx: opts.arrowSpacingPx ?? Math.min(opts.width, opts.height) / 14,
			pxPerMetre: opts.pxPerMetre
		};
		arrows = sampleArrows(raster, arrowOpts);
		for (const a of arrows) if (a.slope > slopeMax) slopeMax = a.slope;
	}

	return {
		hull,
		raster,
		interval,
		levels,
		segments,
		arrows,
		slopeMax,
		min: raster.min,
		max: raster.max
	};
}
