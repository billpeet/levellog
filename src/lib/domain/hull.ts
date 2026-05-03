/**
 * Convex hull + point-in-polygon helpers used to mask IDW-derived layers
 * (heatmap, contours, fall arrows) so they stop at the measured area instead
 * of extrapolating across the rest of the plan.
 *
 * Pure, framework-free; safe to call from server, client, or Web Workers.
 */

export interface Pt {
	x: number;
	y: number;
}

/**
 * Andrew's monotone chain. Returns vertices of the convex hull in
 * counter-clockwise order (in screen-space, where +y is down) without
 * repeating the first vertex at the end. Returns the input as-is for
 * 0/1/2-point inputs.
 */
export function convexHull(points: readonly Pt[]): Pt[] {
	const n = points.length;
	if (n <= 1) return points.map((p) => ({ x: p.x, y: p.y }));

	// Sort by x then y, with an epsilon-free comparator (we have integer-ish px coords).
	const pts = points.map((p) => ({ x: p.x, y: p.y })).sort((a, b) => a.x - b.x || a.y - b.y);

	// Cross product of OA × OB (2D z-component). >0 = counter-clockwise turn.
	const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

	const lower: Pt[] = [];
	for (const p of pts) {
		while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
			lower.pop();
		}
		lower.push(p);
	}

	const upper: Pt[] = [];
	for (let i = pts.length - 1; i >= 0; i--) {
		const p = pts[i];
		while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
			upper.pop();
		}
		upper.push(p);
	}

	// Concat and drop the last point of each chain (it's the first of the other).
	lower.pop();
	upper.pop();
	return lower.concat(upper);
}

/**
 * Median nearest-neighbour distance across the sample set. Used to pad the
 * hull outward so contour lines and arrows aren't clipped flush at the
 * outermost samples.
 *
 * O(n²) — fine for the point counts a single surveyor enters by hand.
 * Returns 0 for n < 2.
 */
export function medianNearestNeighbourDistance(points: readonly Pt[]): number {
	const n = points.length;
	if (n < 2) return 0;
	const dists: number[] = new Array(n);
	for (let i = 0; i < n; i++) {
		let best = Infinity;
		for (let j = 0; j < n; j++) {
			if (i === j) continue;
			const dx = points[i].x - points[j].x;
			const dy = points[i].y - points[j].y;
			const d2 = dx * dx + dy * dy;
			if (d2 < best) best = d2;
		}
		dists[i] = Math.sqrt(best);
	}
	dists.sort((a, b) => a - b);
	const mid = dists.length >> 1;
	return dists.length % 2 ? dists[mid] : (dists[mid - 1] + dists[mid]) / 2;
}

/**
 * Push every vertex of a convex polygon outward along the bisector of its
 * incident edges by `distance` pixels. For a convex hull this preserves
 * convexity and produces a uniformly inflated polygon.
 *
 * Vertices must be in counter-clockwise order (matches `convexHull` output).
 */
export function expandPolygon(poly: readonly Pt[], distance: number): Pt[] {
	const n = poly.length;
	if (n === 0 || distance === 0) return poly.map((p) => ({ x: p.x, y: p.y }));
	if (n === 1) {
		// Degenerate "polygon" — leave as-is; consumers will treat tiny hulls as no-op.
		return [{ x: poly[0].x, y: poly[0].y }];
	}
	if (n === 2) {
		// A line segment — expand into a thin rectangle.
		const [a, b] = poly;
		const dx = b.x - a.x;
		const dy = b.y - a.y;
		const len = Math.hypot(dx, dy) || 1;
		// Outward normal for CCW: rotate edge direction +90°.
		const nx = -dy / len;
		const ny = dx / len;
		return [
			{ x: a.x - nx * distance - (dx / len) * distance, y: a.y - ny * distance - (dy / len) * distance },
			{ x: b.x - nx * distance + (dx / len) * distance, y: b.y - ny * distance + (dy / len) * distance },
			{ x: b.x + nx * distance + (dx / len) * distance, y: b.y + ny * distance + (dy / len) * distance },
			{ x: a.x + nx * distance - (dx / len) * distance, y: a.y + ny * distance - (dy / len) * distance }
		];
	}

	const out: Pt[] = new Array(n);
	for (let i = 0; i < n; i++) {
		const prev = poly[(i - 1 + n) % n];
		const cur = poly[i];
		const next = poly[(i + 1) % n];

		// Outward normals of the two incident edges (CCW polygon → outward = rotate edge by -90°
		// in screen coords where +y is down… equivalently, the right-hand normal of each edge).
		const ex1 = cur.x - prev.x;
		const ey1 = cur.y - prev.y;
		const ex2 = next.x - cur.x;
		const ey2 = next.y - cur.y;
		const l1 = Math.hypot(ex1, ey1) || 1;
		const l2 = Math.hypot(ex2, ey2) || 1;
		// Right-hand normal of (ex, ey) in screen space: (ey, -ex). For our CCW (in screen-y-down)
		// convexHull this points outward. (We use the same sign convention everywhere here.)
		const n1x = ey1 / l1;
		const n1y = -ex1 / l1;
		const n2x = ey2 / l2;
		const n2y = -ex2 / l2;

		// Bisector
		let bx = n1x + n2x;
		let by = n1y + n2y;
		const blen = Math.hypot(bx, by);
		if (blen < 1e-9) {
			// 180° turn (shouldn't happen on a non-degenerate convex hull). Fall back to one normal.
			bx = n1x;
			by = n1y;
		} else {
			bx /= blen;
			by /= blen;
		}
		// Project bisector onto edge normal to get the right scaling for a uniform offset.
		const cos = bx * n1x + by * n1y;
		const scale = cos > 1e-6 ? distance / cos : distance;
		out[i] = { x: cur.x + bx * scale, y: cur.y + by * scale };
	}
	return out;
}

/**
 * Standard ray-casting point-in-polygon. Works for any simple polygon, but we
 * only feed it convex hulls. Boundary inclusion is undefined (good enough for
 * raster cell-centre tests).
 */
export function pointInPolygon(x: number, y: number, poly: readonly Pt[]): boolean {
	const n = poly.length;
	if (n < 3) return false;
	let inside = false;
	for (let i = 0, j = n - 1; i < n; j = i++) {
		const xi = poly[i].x;
		const yi = poly[i].y;
		const xj = poly[j].x;
		const yj = poly[j].y;
		const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi;
		if (intersect) inside = !inside;
	}
	return inside;
}

/**
 * Build a padded convex hull around the samples. The padding is half the
 * median nearest-neighbour distance — generous enough that edge samples sit
 * comfortably inside the masked region, tight enough to still mean "near a
 * sample".
 *
 * Returns null when the cloud is too small/colinear for a meaningful hull
 * (fewer than 3 distinct points or zero area). Callers should treat null as
 * "don't render this layer".
 */
export function buildSampleHull(points: readonly Pt[]): Pt[] | null {
	if (points.length < 3) return null;
	const hull = convexHull(points);
	if (hull.length < 3) return null;
	// Reject colinear hulls (zero area).
	let area2 = 0;
	for (let i = 0, j = hull.length - 1; i < hull.length; j = i++) {
		area2 += hull[j].x * hull[i].y - hull[i].x * hull[j].y;
	}
	if (Math.abs(area2) < 1e-6) return null;

	const pad = medianNearestNeighbourDistance(points) * 0.5;
	return pad > 0 ? expandPolygon(hull, pad) : hull;
}
