export function formatMetres(value: number, digits = 3) {
	return `${value.toFixed(digits)} m`;
}

export function formatMillimetres(value: number) {
	return `${Math.round(value)} mm`;
}
