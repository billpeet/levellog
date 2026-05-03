export interface IdwSample {
	x: number;
	y: number;
	value: number;
}

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
