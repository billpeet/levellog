<script lang="ts">
	let { size = 120 }: { size?: number } = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 120 120"
	fill="none"
	xmlns="http://www.w3.org/2000/svg"
	aria-hidden="true"
	class="text-ink/35"
>
	<circle cx="60" cy="60" r="46" stroke="currentColor" stroke-width="0.6" />
	<circle cx="60" cy="60" r="30" stroke="currentColor" stroke-width="0.6" stroke-dasharray="2 3" />
	<circle cx="60" cy="60" r="6" stroke="currentColor" stroke-width="0.8" />
	<circle cx="60" cy="60" r="1.4" fill="var(--color-accent)" />
	<path d="M 60 0 L 60 50 M 60 70 L 60 120 M 0 60 L 50 60 M 70 60 L 120 60" stroke="currentColor" stroke-width="0.6" />
	<path d="M 60 12 L 56 18 L 64 18 Z" fill="currentColor" opacity="0.5" />
	<text x="60" y="115" font-family="JetBrains Mono, monospace" font-size="6" text-anchor="middle" fill="currentColor">N · 0°</text>
</svg>
