<script lang="ts">
	let { size = 28, accent = false }: { size?: number; accent?: boolean } = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 32 32"
	fill="none"
	xmlns="http://www.w3.org/2000/svg"
	aria-hidden="true"
>
	<!-- surveyor's benchmark: inverted triangle over a horizontal datum line -->
	<path d="M 4 9 L 16 25 L 28 9 Z" stroke="currentColor" stroke-width="1.4" fill="none" />
	<path d="M 1 9 L 31 9" stroke="currentColor" stroke-width="1" />
	<!-- crosshair inside -->
	<circle cx="16" cy="14" r="3.4" stroke="currentColor" stroke-width="1" fill="none" />
	<path d="M 16 11 L 16 17 M 13 14 L 19 14" stroke="currentColor" stroke-width="0.8" />
	{#if accent}
		<circle cx="16" cy="14" r="1.2" fill="var(--color-accent)" />
	{/if}
	<!-- registration ticks -->
	<path
		d="M 1 5 L 1 9 M 31 5 L 31 9"
		stroke="currentColor"
		stroke-width="0.8"
		opacity="0.55"
	/>
</svg>
