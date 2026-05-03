export function calculateInstrumentHeight(benchmarkElevation: number, benchmarkStaffReading: number) {
	return benchmarkElevation + benchmarkStaffReading;
}

export function calculateReducedLevel(instrumentHeight: number, staffReading: number) {
	return instrumentHeight - staffReading;
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
