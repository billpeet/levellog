import type { Pt } from './hull';
import { rasterizeIdw, type IdwSample } from './idw';

export type HeatmapMode = 'sequential' | 'diverging';

export interface HeatmapImage {
	url: string;
	min: number;
	max: number;
	/** Effective absolute extent used for diverging ramps (max(|min|, |max|)). */
	divergingExtent: number;
}

interface BuildOptions {
	/** Plan width in pixels (drives raster aspect). */
	width: number;
	/** Plan height in pixels. */
	height: number;
	mode: HeatmapMode;
	/** Sequential = single-hue ramp. Diverging = symmetric around zero. */
	samples: IdwSample[];
	/** Maximum overall opacity for the ramp's strongest tone (0–255). */
	maxAlpha?: number;
	/** Target raster columns. The image is then stretched to plan size. */
	cols?: number;
	/** Optional convex hull (sample-cloud, padded). Cells outside it render fully transparent. */
	hull?: readonly Pt[] | null;
}

/**
 * Build a rasterised heatmap image from IDW samples and return a data URL plus
 * the value range. Returns null if the environment can't draw (SSR) or there
 * are no samples.
 */
export function buildHeatmapImage(opts: BuildOptions): HeatmapImage | null {
	if (typeof document === 'undefined') return null;
	if (opts.samples.length === 0) return null;
	if (opts.width <= 0 || opts.height <= 0) return null;

	const cols = Math.max(20, Math.min(240, opts.cols ?? 140));
	const rows = Math.max(20, Math.round(cols * (opts.height / opts.width)));

	const raster = rasterizeIdw(opts.samples, opts.width, opts.height, cols, rows, {
		hull: opts.hull ?? null
	});
	if (!raster) return null;

	const { data, min, max } = raster;
	if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
	const range = max - min;
	const divergingExtent = Math.max(Math.abs(min), Math.abs(max));
	const maxAlpha = opts.maxAlpha ?? 170;

	const canvas = document.createElement('canvas');
	canvas.width = cols;
	canvas.height = rows;
	const ctx = canvas.getContext('2d');
	if (!ctx) return null;

	const img = ctx.createImageData(cols, rows);
	const buf = img.data;

	for (let i = 0; i < data.length; i++) {
		const v = data[i];
		if (!Number.isFinite(v)) {
			// Outside the sample-cloud hull — leave the pixel fully transparent.
			const o = i * 4;
			buf[o] = 0;
			buf[o + 1] = 0;
			buf[o + 2] = 0;
			buf[o + 3] = 0;
			continue;
		}
		let rgba: [number, number, number, number];
		if (opts.mode === 'sequential') {
			const t = range > 0 ? (v - min) / range : 0.5;
			rgba = sequentialRamp(t, maxAlpha);
		} else {
			rgba = divergingRamp(v, divergingExtent, maxAlpha);
		}
		const o = i * 4;
		buf[o] = rgba[0];
		buf[o + 1] = rgba[1];
		buf[o + 2] = rgba[2];
		buf[o + 3] = rgba[3];
	}

	ctx.putImageData(img, 0, 0);

	return {
		url: canvas.toDataURL('image/png'),
		min,
		max,
		divergingExtent
	};
}

function lerp(a: number, b: number, t: number) {
	return Math.round(a + (b - a) * t);
}

/**
 * Sequential ramp used for elevation heatmaps. Walks signal-deep → warning →
 * accent so low ground reads as cool green and high ground reads as warm
 * orange — matches the "field instrument" palette.
 */
export function sequentialRamp(t: number, maxAlpha = 170): [number, number, number, number] {
	const u = Math.max(0, Math.min(1, t));
	let r: number;
	let g: number;
	let b: number;
	if (u < 0.5) {
		const k = u / 0.5;
		// signal-deep #1f5b41 → warning #c79400
		r = lerp(0x1f, 0xc7, k);
		g = lerp(0x5b, 0x94, k);
		b = lerp(0x41, 0x00, k);
	} else {
		const k = (u - 0.5) / 0.5;
		// warning #c79400 → accent-deep #b6361a
		r = lerp(0xc7, 0xb6, k);
		g = lerp(0x94, 0x36, k);
		b = lerp(0x00, 0x1a, k);
	}
	return [r, g, b, maxAlpha];
}

/**
 * Diverging ramp for delta heatmaps (current − finished).
 *  +ve  → accent  (cut needed: ground sits above design level)
 *   0   → vellum / near-transparent
 *  −ve  → signal  (fill needed: ground sits below design level)
 *
 * Alpha scales with magnitude so neutral cells stay near-invisible.
 */
export function divergingRamp(
	value: number,
	extent: number,
	maxAlpha = 200
): [number, number, number, number] {
	if (extent <= 0) return [0xfa, 0xf6, 0xeb, 0];
	const t = Math.max(-1, Math.min(1, value / extent));
	const m = Math.abs(t);
	const alpha = Math.round(maxAlpha * Math.pow(m, 0.7));
	if (t > 0) {
		// fade vellum → accent-deep
		return [
			lerp(0xfa, 0xb6, m),
			lerp(0xf6, 0x36, m),
			lerp(0xeb, 0x1a, m),
			alpha
		];
	}
	if (t < 0) {
		// fade vellum → signal-deep
		return [
			lerp(0xfa, 0x1f, m),
			lerp(0xf6, 0x5b, m),
			lerp(0xeb, 0x41, m),
			alpha
		];
	}
	return [0xfa, 0xf6, 0xeb, 0];
}
